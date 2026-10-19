// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {req, ext, sv, tokenCall} from "./PotUtil.sol";

interface IFractionM {
    function vault() external view returns (address);
    function receiptId() external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IVaultM {
    function fractionOf(uint256 id) external view returns (address);
    function isSettled(uint256 id) external view returns (bool);
    function settlementOf(uint256 id) external view returns (
        address token, uint256 faceValue, bool settled, uint256 amount, uint256 supply, uint256 paidOut);
}

/// @title Market — fixed-price secondary market for PotKit Fraction shares.
/// @notice Sellers ESCROW shares in this contract when listing (a listing can never be "empty"
///         because the seller moved the shares away). Buyers take any amount; sellers cancel to
///         get the rest back. Buying is blocked once the underlying invoice is settled — at that
///         point shares should be claimed in the Vault, so sellers cancel and claim.
/// @dev A listing is packed into 3 storage slots (Portaldot charges a deposit per storage item):
///      price and amount are capped at 2^96-1 (≈7.9e28 base units, i.e. ~79 billion whole shares).
///      The paged `listings()` reader lives in Lens (run inside eth_call, never deployed).
contract Market {
    /// @dev ABI shape returned by listing() (unchanged from earlier versions)
    struct Listing {
        address seller;
        address fraction;   // Fraction share token (18 decimals)
        address payToken;   // ERC-20 the price is quoted in (e.g. tUSD)
        uint256 price;      // payToken base units per 1 whole share (1e18 share units)
        uint256 remaining;  // share units still for sale (held by this contract)
        uint256 receiptId;
    }

    struct Packed {
        address seller; uint96 price;
        address fraction; uint96 receiptId;
        address payToken; uint96 remaining;
    }

    IVaultM public immutable vault;
    Packed[] private _listings;
    uint256 private _lock = 1;

    event Listed(uint256 indexed listingId, address indexed seller, address indexed fraction, address payToken, uint256 price, uint256 amount);
    event Bought(uint256 indexed listingId, address indexed buyer, uint256 amount, uint256 cost);
    event Cancelled(uint256 indexed listingId, uint256 returned);

    modifier nonReentrant() {
        req(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address vault_) {
        req(vault_ != address(0), "zero");
        vault = IVaultM(vault_);
    }

    /// @dev Seller must approve this Market for `amount` on the Fraction token first.
    function list(address fraction, address payToken, uint256 price, uint256 amount) external nonReentrant returns (uint256 listingId) {
        req(amount > 0 && amount <= type(uint96).max, "amount");
        req(price > 0 && price <= type(uint96).max, "price");
        req(payToken != address(0) && payToken.code.length > 0, "token");
        address v = address(vault);
        uint256 rid = sv(fraction, IFractionM.receiptId.selector, 0, 0, 0);
        // only genuine PotKit shares of THIS vault
        req(sv(fraction, IFractionM.vault.selector, 0, 0, 0) == uint160(v)
            && sv(v, IVaultM.fractionOf.selector, rid, 0, 0) == uint160(fraction), "not potkit");
        // only invoices with payment terms, priced in the invoice's own payment token
        req(sv(v, IVaultM.settlementOf.selector, rid, 0, 1) != 0, "terms required"); // faceValue
        req(sv(v, IVaultM.settlementOf.selector, rid, 0, 0) == uint160(payToken), "pay token"); // token
        req(sv(v, IVaultM.isSettled.selector, rid, 0, 0) == 0, "settled");
        req(cost(price, amount) > 0, "too small");
        listingId = _listings.length;
        _listings.push(Packed(msg.sender, uint96(price), fraction, uint96(rid), payToken, uint96(amount)));
        emit Listed(listingId, msg.sender, fraction, payToken, price, amount);
        ext(fraction, IFractionM.transferFrom.selector, uint160(msg.sender), uint160(address(this)), amount, 0); // escrow (verified PotKit share)
    }

    /// @notice Buy `amount` share units. Cost rounds UP (seller never short-changed).
    /// @dev Buyer must approve this Market for the cost on payToken. `maxCost` protects against surprises.
    function buy(uint256 listingId, uint256 amount, uint256 maxCost) external nonReentrant returns (uint256 paid) {
        Packed storage l = _get(listingId);
        req(amount > 0 && amount <= l.remaining, "amount");
        req(msg.sender != l.seller, "own listing");
        req(sv(address(vault), IVaultM.isSettled.selector, l.receiptId, 0, 0) == 0, "settled");
        paid = cost(l.price, amount);
        req(paid <= maxCost, "slippage");
        l.remaining -= uint96(amount); // effects
        emit Bought(listingId, msg.sender, amount, paid);
        tokenCall(l.payToken, 0x23b872dd, uint160(msg.sender), uint160(l.seller), paid, "payment"); // interactions
        ext(l.fraction, IFractionM.transfer.selector, uint160(msg.sender), amount, 0, 0); // deliver
    }

    function cancel(uint256 listingId) external nonReentrant {
        Packed storage l = _get(listingId);
        req(msg.sender == l.seller, "not seller");
        uint256 left = l.remaining;
        req(left > 0, "closed");
        l.remaining = 0;
        emit Cancelled(listingId, left);
        ext(l.fraction, IFractionM.transfer.selector, uint160(msg.sender), left, 0, 0); // return
    }

    // ---- views ------------------------------------------------------------
    function cost(uint256 price, uint256 amount) public pure returns (uint256) {
        return (price * amount + 1e18 - 1) / 1e18;
    }

    function count() external view returns (uint256) {
        return _listings.length;
    }

    function listing(uint256 listingId) external view returns (Listing memory) {
        Packed storage l = _get(listingId);
        return Listing(l.seller, l.fraction, l.payToken, l.price, l.remaining, l.receiptId);
    }

    function _get(uint256 listingId) private view returns (Packed storage) {
        req(listingId < _listings.length, "no listing");
        return _listings[listingId];
    }
}
