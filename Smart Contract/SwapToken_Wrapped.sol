// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

/**
 * @title SwapToken
 * @dev Simple AMM DEX (ETH <-> Token) upgradeable (Transparent Proxy compatible).
 *      This contract aims to be safer for production (better checks, safe transfers,
 *      pausable, admin rescue functions, slippage protection). Still treat this as
 *      example — audit before production.
 */
contract SwapToken is
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;
    using AddressUpgradeable for address;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20Upgradeable public token; // MRT token
    uint256 public feeNumerator;    // e.g. 3
    uint256 public feeDenominator;  // e.g. 1000

    uint256 public constant MAX_FEE_NUMERATOR = 50; // max 5% if denom 1000
    uint256 public constant MINIMUM_LIQUIDITY = 1000; // minimum LP locked (effectively subtracted on first mint)

    // Events
    event LiquidityAdded(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 lpMinted);
    event LiquidityRemoved(address indexed provider, uint256 ethAmount, uint256 tokenAmount, uint256 lpBurned);
    event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    event FeeUpdated(uint256 newNumerator, uint256 newDenominator);
    event RescueERC20(address indexed token, address indexed to, uint256 amount);
    event RescueETH(address indexed to, uint256 amount);

    // -------- INITIALIZER --------
    function initialize(
        address _token,
        address admin,
        uint256 _feeNumerator,
        uint256 _feeDenominator
    ) external initializer
    {
        require(_token != address(0), "invalid token");
        require(admin != address(0), "invalid admin");
        require(_feeDenominator > 0, "invalid denom");
        require(_feeNumerator <= MAX_FEE_NUMERATOR, "fee too high");
        require(_feeNumerator < _feeDenominator, "fee >= denom");

        // sanity: token must be a contract
        require(_token.isContract(), "token not contract");

        __ERC20_init("WMRTSwap LP Token", "WMSLP");
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        token = IERC20Upgradeable(_token);
        feeNumerator = _feeNumerator;
        feeDenominator = _feeDenominator;

        // Roles:
        // DEFAULT_ADMIN_ROLE: can grant/revoke roles
        // ADMIN_ROLE: operational admin (setFee, pause, rescue)
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // -------- VIEWS --------

    /// @notice returns token reserve and eth reserve (eth reserve excludes msg.value — use carefully in payable contexts)
    function getReserves() public view returns (uint256 tokenReserve, uint256 ethReserve) {
        tokenReserve = token.balanceOf(address(this));
        ethReserve = address(this).balance;
    }

    // internal helper: fee calculation and AMM formula
    // amountInWithFee = amountIn * (feeDenominator - feeNumerator)
    // amountOut = (amountInWithFee * reserveOut) / (reserveIn * feeDenominator + amountInWithFee)
    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) internal view returns (uint256) {
        require(amountIn > 0, "insufficient in");
        require(reserveIn > 0 && reserveOut > 0, "insufficient liquidity");
        require(feeDenominator > feeNumerator, "invalid fee");

        // guard against multiplication overflow: amountIn * (feeDenominator - feeNumerator)
        uint256 multiplier = feeDenominator - feeNumerator;
        require(amountIn == 0 || multiplier == 0 || amountIn <= type(uint256).max / multiplier, "overflow amountIn*mult");
        uint256 amountInWithFee = amountIn * multiplier;

        // numerator = amountInWithFee * reserveOut
        require(amountInWithFee == 0 || reserveOut == 0 || amountInWithFee <= type(uint256).max / reserveOut, "overflow num");
        uint256 numerator = amountInWithFee * reserveOut;

        // denominator = reserveIn * feeDenominator + amountInWithFee
        require(reserveIn == 0 || feeDenominator == 0 || reserveIn <= type(uint256).max / feeDenominator, "overflow denomPart");
        uint256 denomPart = reserveIn * feeDenominator;

        uint256 denominator = denomPart + amountInWithFee;
        return numerator / denominator;
    }

    // -------- LIQUIDITY FUNCTIONS --------

    /**
     * @notice Add liquidity. Caller must approve token transfer first.
     * @param _tokenDesired amount of tokens user will provide
     * @return lpMinted LP tokens minted to provider
     */
    function addLiquidity(uint256 _tokenDesired)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 lpMinted)
    {
        uint256 ethAmount = msg.value;
        require(ethAmount > 0 && _tokenDesired > 0, "need ETH + token");

        uint256 lpSupply = totalSupply();
        uint256 tokenReserve = token.balanceOf(address(this));
        // previous eth reserve (exclude current msg.value)
        uint256 ethReserve = address(this).balance - ethAmount;

        uint256 tokenAmount;
        if (lpSupply == 0) {
            // first liquidity provider: use _tokenDesired as token amount
            tokenAmount = _tokenDesired;

            // prevent overflow in product
            require(tokenAmount == 0 || ethAmount <= type(uint256).max / tokenAmount, "overflow product");

            uint256 root = MathUpgradeable.sqrt(ethAmount * tokenAmount);
            require(root > MINIMUM_LIQUIDITY, "insufficient initial liquidity");

            // Subtract MINIMUM_LIQUIDITY from minted amount (do NOT mint to zero address)
            lpMinted = root - MINIMUM_LIQUIDITY;

            // Note: we do NOT mint MINIMUM_LIQUIDITY to address(0) because OpenZeppelin ERC20 forbids mint to zero.
            // This approach mirrors effect of leaving MINIMUM_LIQUIDITY out of provider's share.
        } else {
            // Keep ratio: tokenAmount = ethAmount * tokenReserve / ethReserve
            require(ethReserve > 0, "no eth reserve");
            // protect multiplication overflow: ethAmount * tokenReserve
            require(tokenReserve == 0 || ethAmount <= type(uint256).max / tokenReserve, "overflow mul");
            tokenAmount = (ethAmount * tokenReserve) / ethReserve;
            require(tokenAmount > 0 && tokenAmount <= _tokenDesired, "invalid token amount");

            // mint proportionally: lpMinted = ethAmount * lpSupply / ethReserve
            require(lpSupply == 0 || ethAmount <= type(uint256).max / lpSupply, "overflow mul2");
            lpMinted = (ethAmount * lpSupply) / ethReserve;
        }

        // Transfer tokens safely (from user)
        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        // Mint LP to provider
        _mint(msg.sender, lpMinted);

        emit LiquidityAdded(msg.sender, ethAmount, tokenAmount, lpMinted);
        return lpMinted;
    }

    /**
     * @notice Remove liquidity with slippage protection
     * @param lpAmount amount of LP tokens to burn
     * @param minEthOut minimum acceptable ETH to receive (slippage protection)
     * @param minTokenOut minimum acceptable tokens to receive
     */
    function removeLiquidity(uint256 lpAmount, uint256 minEthOut, uint256 minTokenOut)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 ethOut, uint256 tokenOut)
    {
        require(lpAmount > 0, "zero amount");

        uint256 lpSupply = totalSupply();
        require(lpSupply > 0, "no lp supply");

        uint256 ethReserve = address(this).balance;
        uint256 tokenReserve = token.balanceOf(address(this));

        // protect overflow when multiplying
        require(lpAmount == 0 || ethReserve <= type(uint256).max / lpAmount, "overflow ethOut");
        ethOut = (lpAmount * ethReserve) / lpSupply;

        require(lpAmount == 0 || tokenReserve <= type(uint256).max / lpAmount, "overflow tokenOut");
        tokenOut = (lpAmount * tokenReserve) / lpSupply;

        require(ethOut >= minEthOut && tokenOut >= minTokenOut, "insufficient output");

        _burn(msg.sender, lpAmount);

        // Transfer token then ETH (safe)
        token.safeTransfer(msg.sender, tokenOut);

        (bool ok, ) = payable(msg.sender).call{ value: ethOut }("");
        require(ok, "ETH send fail");

        emit LiquidityRemoved(msg.sender, ethOut, tokenOut, lpAmount);
    }

    // -------- SWAP FUNCTIONS (with slippage protection) --------

    /**
     * @notice Swap ETH -> Token
     * @param minTokenOut minimum token amount acceptable (slippage protection)
     */
    function swapEthToToken(uint256 minTokenOut)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 tokenOut)
    {
        uint256 ethIn = msg.value;
        require(ethIn > 0, "zero eth");

        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 ethReserve = address(this).balance - ethIn;

        tokenOut = _getAmountOut(ethIn, ethReserve, tokenReserve);
        require(tokenOut >= minTokenOut, "insufficient output");

        token.safeTransfer(msg.sender, tokenOut);

        emit Swapped(msg.sender, address(0), address(token), ethIn, tokenOut);
    }

    /**
     * @notice Swap Token -> ETH
     * @param tokenIn amount of tokens supplied
     * @param minEthOut minimum ETH acceptable (slippage protection)
     */
    function swapTokenToEth(uint256 tokenIn, uint256 minEthOut)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 ethOut)
    {
        require(tokenIn > 0, "zero token");

        uint256 tokenReserve = token.balanceOf(address(this));
        uint256 ethReserve = address(this).balance;

        ethOut = _getAmountOut(tokenIn, tokenReserve, ethReserve);
        require(ethOut >= minEthOut, "insufficient output");

        // Transfer tokens in, then send ETH out
        token.safeTransferFrom(msg.sender, address(this), tokenIn);

        (bool ok, ) = payable(msg.sender).call{ value: ethOut }("");
        require(ok, "ETH send fail");

        emit Swapped(msg.sender, address(token), address(0), tokenIn, ethOut);
    }

    // -------- ADMIN FUNCTIONS (only ADMIN_ROLE) --------

    /// @notice setFee callable by ADMIN_ROLE (separate from DEFAULT_ADMIN_ROLE)
    function setFee(uint256 _num, uint256 _den) external onlyRole(ADMIN_ROLE) {
        require(_den > 0, "invalid denom");
        require(_num <= MAX_FEE_NUMERATOR, "fee too high");
        require(_num < _den, "num >= den");
        feeNumerator = _num;
        feeDenominator = _den;
        emit FeeUpdated(_num, _den);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Rescue arbitrary ERC20 stuck in contract (except LP token and core token)
    function rescueERC20(address erc20, address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "invalid to");
        require(amount > 0, "zero amount");
        // Prevent rescuing LP token (this contract's token) or the core token used by the pair
        require(erc20 != address(this), "cannot rescue LP token");
        require(erc20 != address(token), "cannot rescue core token");
        IERC20Upgradeable(erc20).safeTransfer(to, amount);
        emit RescueERC20(erc20, to, amount);
    }

    /// @notice Rescue ETH stuck in contract
    function rescueETH(address to, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(to != address(0), "invalid to");
        require(amount > 0, "zero amount");
        (bool ok, ) = payable(to).call{ value: amount }("");
        require(ok, "send fail");
        emit RescueETH(to, amount);
    }

    // Allow contract to receive ETH
    receive() external payable {}

    // gap for upgrades
    uint256[45] private __gap;
}
