// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Upgradeable TokenVault (lock tokens on origin chain)
 * - emits TokensLocked for relayers
 * - release() guarded by VAULT_OPERATOR_ROLE (bridge operator)
 * - transferID used to uniquely identify each lock/release
 */
contract TokenVault_V2 is Initializable, ReentrancyGuardUpgradeable, AccessControlUpgradeable, PausableUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    IERC20Upgradeable public token; // token to lock (MRT)
    bytes32 public constant VAULT_OPERATOR_ROLE = keccak256("VAULT_OPERATOR_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint64 public nonce; // compact nonce for transferID

    event TokensLocked(
        address indexed user,
        address indexed toChainRecipient,
        uint256 amount,
        uint64 nonce,
        bytes32 transferID
    );
    event TokensReleased(
        address indexed to,
        uint256 amount,
        bytes32 transferID
    );

    function initialize(IERC20Upgradeable _token, address admin) external initializer {
        __ReentrancyGuard_init();
        __AccessControl_init();
        __Pausable_init();

        token = _token;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VAULT_OPERATOR_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        nonce = 2;
    }

    /* ========== PAUSE ========== */
    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    /* ========== LOCK ========== */
    function lock(address toChainRecipient, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        require(amount > 0, "zero amount");
        token.safeTransferFrom(msg.sender, address(this), amount);

        // generate transferID
        bytes32 transferID = keccak256(abi.encodePacked(msg.sender, toChainRecipient, amount, nonce, block.chainid, block.timestamp));

        emit TokensLocked(msg.sender, toChainRecipient, amount, nonce, transferID);
        unchecked { nonce += 1; }
    }

    /* ========== RELEASE ========== */
    function release(address to, uint256 amount, bytes32 transferID)
        external
        onlyRole(VAULT_OPERATOR_ROLE)
        nonReentrant
    {
        require(amount > 0, "zero amount");
        token.safeTransfer(to, amount);

        emit TokensReleased(to, amount, transferID);
    }

    // Storage gap for future upgrades
    uint256[45] private __gap;
}
