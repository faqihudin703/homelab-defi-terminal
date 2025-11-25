// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title wMRT (Upgradeable)
 * - Menambahkan burnForBridge() untuk cross-chain
 * - wrap/unwrap dinonaktifkan
 * - Upgradeable Transparent Proxy compatible
 */
contract wMRT is Initializable, ERC20Upgradeable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public under; // underlying token (MRT) address
    bytes32 public constant WRAP_ADMIN_ROLE = keccak256("WRAP_ADMIN_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    mapping(bytes32 => bool) public processed; // prevents double-mint

    // ====== EVENTS ======
    event MintedByAdmin(address indexed to, uint256 amount, bytes32 indexed transferId);
    event TokensBurned(address indexed user, uint256 amount, bytes32 indexed transferId);

    // ====== INITIALIZER ======
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address admin,
        IERC20Upgradeable _under
    ) external initializer {
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __Pausable_init();

        under = _under;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(WRAP_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ====== PAUSE ======
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    // ====== WRAP / UNWRAP (dinonaktifkan) ======
    function wrap(uint256) external pure {
        revert("wrap disabled");
    }

    function unwrap(uint256) external pure {
        revert("unwrap disabled");
    }

    // ====== BURN FOR BRIDGE ======
    function burnForBridge(uint256 amount, bytes32 transferId) external whenNotPaused {
        require(amount > 0, "zero amount");
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount, transferId);
    }

    // ====== ADMIN MINT (cross-chain) ======
    function mintWrapped(address to, uint256 amount, bytes32 transferId)
        external
        onlyRole(WRAP_ADMIN_ROLE)
        whenNotPaused
    {
        require(!processed[transferId], "processed");
        processed[transferId] = true;
        _mint(to, amount);
        emit MintedByAdmin(to, amount, transferId);
    }

    // Storage gap for future upgrades
    uint256[50] private __gap;
}
