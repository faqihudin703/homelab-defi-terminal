// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

/// @title StableSwap - simple two-token constant-product AMM (upgradeable)
contract StableSwap is 
    Initializable,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    IERC20Upgradeable public tokenA;
    IERC20Upgradeable public tokenB;

    /// @notice fee in basis points (1 bps = 0.01%). e.g. 4 = 0.04%
    uint256 public feeBps;

    event Swap(
        address indexed user, 
        address indexed tokenIn, 
        address indexed tokenOut, 
        uint256 amountIn, 
        uint256 amountOut
    );

    event LiquidityAdded(
        address indexed provider, 
        uint256 amountA, 
        uint256 amountB, 
        uint256 lpTokensMinted
    );

    event LiquidityRemoved(
        address indexed provider, 
        uint256 amountA, 
        uint256 amountB, 
        uint256 lpTokensBurned
    );

    event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the contract (replace constructor for upgradeable)
     */
    function initialize(
        address _tokenA,
        address _tokenB,
        address admin,
        uint256 _feeBps
    ) external initializer {
        __ERC20_init("StableSwap LP Token", "StableLP");
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();

        require(_tokenA != address(0) && _tokenB != address(0), "Zero token");
        require(_tokenA != _tokenB, "Tokens must differ");
        require(admin != address(0), "Zero admin");
        require(_feeBps <= 100, "Fee too high");

        tokenA = IERC20Upgradeable(_tokenA);
        tokenB = IERC20Upgradeable(_tokenB);

        feeBps = _feeBps;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ================================
    //        LIQUIDITY
    // ================================

    function addLiquidity(uint256 amountA, uint256 amountB)
        public
        nonReentrant
        whenNotPaused
        returns (uint256 lpTokens)
    {
        require(amountA > 0 && amountB > 0, "Amounts must be > 0");

        uint256 reserveA = tokenA.balanceOf(address(this));
        uint256 reserveB = tokenB.balanceOf(address(this));

        tokenA.safeTransferFrom(msg.sender, address(this), amountA);
        tokenB.safeTransferFrom(msg.sender, address(this), amountB);

        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            require(amountA <= type(uint256).max / amountB, "Product overflow");
            lpTokens = _sqrt(amountA * amountB);
            require(lpTokens > 0, "Insufficient liquidity minted");
        } else {
            require(reserveA > 0 && reserveB > 0, "Pool has no reserves");

            uint256 lpFromA = (amountA * _totalSupply) / reserveA;
            uint256 lpFromB = (amountB * _totalSupply) / reserveB;

            lpTokens = lpFromA < lpFromB ? lpFromA : lpFromB;
            require(lpTokens > 0, "Insufficient liquidity");
        }

        _mint(msg.sender, lpTokens);
        emit LiquidityAdded(msg.sender, amountA, amountB, lpTokens);
    }

    function removeLiquidity(uint256 lpTokensToBurn)
        public
        nonReentrant
        whenNotPaused
        returns (uint256 amountA, uint256 amountB)
    {
        require(lpTokensToBurn > 0, "Burn > 0");
        require(balanceOf(msg.sender) >= lpTokensToBurn, "Insufficient LP");

        uint256 _totalLp = totalSupply();
        uint256 reserveA = tokenA.balanceOf(address(this));
        uint256 reserveB = tokenB.balanceOf(address(this));

        amountA = (lpTokensToBurn * reserveA) / _totalLp;
        amountB = (lpTokensToBurn * reserveB) / _totalLp;

        _burn(msg.sender, lpTokensToBurn);

        tokenA.safeTransfer(msg.sender, amountA);
        tokenB.safeTransfer(msg.sender, amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, lpTokensToBurn);
    }

    // ================================
    //            SWAP
    // ================================

    function _getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) internal view returns (uint256) {
        require(reserveIn > 0 && reserveOut > 0, "Empty reserves");

        uint256 amountInAfterFee = (amountIn * (10000 - feeBps)) / 10000;

        uint256 numerator = amountInAfterFee * reserveOut;
        uint256 denominator = reserveIn + amountInAfterFee;
        return numerator / denominator;
    }

    function swapAforB(uint256 amountA_In, uint256 minAmountBOut)
        external
        nonReentrant
        whenNotPaused
    {
        require(amountA_In > 0, "amountIn > 0");

        uint256 reserveA = tokenA.balanceOf(address(this));
        uint256 reserveB = tokenB.balanceOf(address(this));

        uint256 amountB_Out = _getAmountOut(amountA_In, reserveA, reserveB);
        require(amountB_Out >= minAmountBOut, "Slippage exceeded");

        tokenA.safeTransferFrom(msg.sender, address(this), amountA_In);
        tokenB.safeTransfer(msg.sender, amountB_Out);

        emit Swap(msg.sender, address(tokenA), address(tokenB), amountA_In, amountB_Out);
    }

    function swapBforA(uint256 amountB_In, uint256 minAmountAOut)
        external
        nonReentrant
        whenNotPaused
    {
        require(amountB_In > 0, "amountIn > 0");

        uint256 reserveA = tokenA.balanceOf(address(this));
        uint256 reserveB = tokenB.balanceOf(address(this));

        uint256 amountA_Out = _getAmountOut(amountB_In, reserveB, reserveA);
        require(amountA_Out >= minAmountAOut, "Slippage exceeded");

        tokenB.safeTransferFrom(msg.sender, address(this), amountB_In);
        tokenA.safeTransfer(msg.sender, amountA_Out);

        emit Swap(msg.sender, address(tokenB), address(tokenA), amountB_In, amountA_Out);
    }

    // ================================
    //        ADMIN FUNCTIONS
    // ================================

    function setFeeBps(uint256 _feeBps) external onlyRole(ADMIN_ROLE) {
        require(_feeBps <= 100, "Fee too high"); // max 1%
        uint256 old = feeBps;
        feeBps = _feeBps;
        emit FeeUpdated(old, _feeBps);
    }

    function pause() external onlyRole(ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

    // ================================
    //        OVERRIDES
    // ================================

    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override(ERC20Upgradeable)
    {
        super._beforeTokenTransfer(from, to, amount);
        require(!paused(), "Token transfer while paused");
    }

    // ================================
    //        INTERNAL UTILS
    // ================================

    function _sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    uint256[45] private __gap;
}