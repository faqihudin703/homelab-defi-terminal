// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721URIStorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/CountersUpgradeable.sol";

/**
 * @title HomelabCollectionUpgradeable (HLAB) - Logic Contract
 * @dev Upgradeable implementation using Transparent proxy pattern.
 * - Initializer instead of constructor.
 * - Pausable, Ownable.
 * - approve functions exposed for readability (still user-only).
 */
contract HomelabCollectionUpgradeable is Initializable, ERC721URIStorageUpgradeable, OwnableUpgradeable, PausableUpgradeable {
    using CountersUpgradeable for CountersUpgradeable.Counter;
    CountersUpgradeable.Counter private _tokenIds;

    uint256 public mintPrice;

    event NFTMinted(uint256 indexed tokenId, address indexed minter, string tokenURI);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        // Leave empty — implementation contract should not initialize state.
        _disableInitializers();
    }

    /**
     * @dev Initialize function (replace constructor).
     * @param name_ token name
     * @param symbol_ token symbol
     * @param owner_ owner address (will be transferred to this owner)
     * @param mintPrice_ initial mint price (wei)
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        address owner_,
        uint256 mintPrice_
    ) public initializer {
        __ERC721_init(name_, symbol_);
        __ERC721URIStorage_init();
        __Ownable_init();
        __Pausable_init();

        // transfer ownership to desired owner
        if (owner_ != address(0) && owner_ != _msgSender()) {
            transferOwnership(owner_);
        }

        mintPrice = mintPrice_;
    }

    // -------------------------
    // MINTING (USER)
    // -------------------------
    function mint(string memory _tokenURI) public payable whenNotPaused returns (uint256) {
        require(msg.value >= mintPrice, "Biaya minting kurang!");

        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();

        _safeMint(msg.sender, newItemId);
        _setTokenURI(newItemId, _tokenURI);

        emit NFTMinted(newItemId, msg.sender, _tokenURI);
        return newItemId;
    }
    
    // -------------------------
    // PAUSE (ADMIN)
    // -------------------------
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // -------------------------
    // WITHDRAW (ADMIN)
    // -------------------------
    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "Saldo kosong");

        (bool sent, ) = payable(owner()).call{value: balance}("");
        require(sent, "Transfer gagal");
    }

    // -------------------------
    // ADMIN CONFIG
    // -------------------------
    function setMintPrice(uint256 _price) public onlyOwner {
        mintPrice = _price;
    }

    // -------------------------
    // PAUSABLE PROTECTION (TRANSFER/MINT)
    // -------------------------
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 tokenId,
        uint256 batchSize
    )
        internal
        virtual
        override(ERC721Upgradeable)
        whenNotPaused
    {
        super._beforeTokenTransfer(from, to, tokenId, batchSize);
    }

    // -------------------------
    // STORAGE GAP (for future upgrades)
    // -------------------------
    uint256[45] private __gap;
}
