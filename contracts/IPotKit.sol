// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice ABI of PotKit.yul — one contract that is the ERC-721 receipt registry, the share vault,
/// the native-tPOT settlement pool and the share market. Errors are Error(string) reasons.
/// Batch views (rows, statuses, claimables, listings, metadata JSON) are in Lens.sol, run with eth_call.
interface IPotKit {
    // ERC-721 (receipts)
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    /// kind 1 lock(units, faceValue, dueDate) · 2 redeem · 4 settle(amount)
    /// · 5 claim(shares, payout) · 6 list(listingId, price, amount) · 7 buy(listingId, amount, cost)
    /// · 8 cancel(listingId, returned)
    event Activity(uint256 indexed id, address indexed actor, uint256 kind, uint256 a, uint256 b, uint256 c);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 id) external view returns (string memory);
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 id) external view returns (address);
    function getApproved(uint256 id) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
    function approve(address to, uint256 id) external;
    function setApprovalForAll(address operator, bool approved) external;
    function transferFrom(address from, address to, uint256 id) external;
    function safeTransferFrom(address from, address to, uint256 id) external;
    function safeTransferFrom(address from, address to, uint256 id, bytes calldata data) external;

    // receipts
    function issuer() external view returns (address);
    function setMinter(address minter, bool allowed) external;
    /// kind 0 invoice · 1 content right · 2 equipment; note 1..140 printable chars, no " or \
    function mint(address to, uint8 kind, string calldata note) external returns (uint256 id);

    // vault — the receipt owner locks it directly (no NFT approval needed) and sets the terms in the
    // same call: faceValue in wei of tPOT (1 .. 2^96-1), dueDate unix seconds (0 = none)
    function fractionalize(uint256 id, uint256 units, uint256 faceValue, uint64 dueDate) external returns (address token);
    /// whoever holds every outstanding share gets the receipt back (after settlement: once all shares are claimed, the depositor)
    function redeem(uint256 id) external;
    /// anyone pays msg.value >= faceValue tPOT into the pool
    function settle(uint256 id) external payable;
    function claim(uint256 id) external returns (uint256 payout);

    // market — price is wei of tPOT per whole share (1e18 share units)
    function list(uint256 id, uint256 price, uint256 amount) external returns (uint256 listingId);
    /// msg.value must equal ceil(price * amount / 1e18)
    function buy(uint256 listingId, uint256 amount) external payable returns (uint256 cost);
    function cancel(uint256 listingId) external;

    /// raw storage words (used by Lens.sol)
    function peek(uint256[] calldata slots) external view returns (uint256[] memory);
}

/// @notice ABI of a PotKit share token (82-byte forwarder; balances live in PotKit).
interface IFraction {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address owner) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
