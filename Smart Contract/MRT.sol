// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * Upgradeable MRT token (Transparent Proxy compatible)
 * - AccessControl for roles
 * - Pausable
 * - initializer instead of constructor
 */
contract MRT is Initializable, ERC20Upgradeable, AccessControlUpgradeable, PausableUpgradeable {
    bytes32 public constant BRIDGE_ROLE = keccak256("BRIDGE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice initialize instead of constructor
    function initialize(
        string calldata name_,
        string calldata symbol_,
        address admin
    ) external initializer {
        __ERC20_init(name_, symbol_);
        __AccessControl_init();
        __Pausable_init();

        // grant roles to admin
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    /* ========== PAUSE ========== */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /* ========== MINT / BURN ========== */
    function mint(address to, uint256 amount) external onlyRole(BRIDGE_ROLE) whenNotPaused {
        _mint(to, amount);
    }

    function burnFromBridge(address /*from*/, uint256 /*amount*/) external onlyRole(BRIDGE_ROLE) whenNotPaused {
        revert("burnFromBridge disabled");
    }

    function burn(uint256 amount) external whenNotPaused {
        _burn(msg.sender, amount);
    }

    /* ========== HOOKS ========== */
    function _beforeTokenTransfer(address from, address to, uint256 amount)
        internal
        override
        whenNotPaused
    {
        super._beforeTokenTransfer(from, to, amount);
    }

    // Storage gap for future upgrades
    uint256[50] private __gap;
}
