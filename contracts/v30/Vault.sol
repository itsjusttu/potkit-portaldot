// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Fraction} from "./Fraction.sol";
import {req, ext, sv, tokenCall} from "./PotUtil.sol";

interface IReceipt {
    function nextId() external view returns (uint256);
    function transferFrom(address from, address to, uint256 id) external;
}

interface IERC20Min {
    function balanceOf(address who) external view returns (uint256);
}

/// @title Vault — locks a Receipt NFT and issues a fixed supply of ERC-20 shares against it.
/// @notice Whoever holds 100% of the shares can burn them and take the receipt back.
///         This is what makes the shares *backed*: the NFT cannot move while they exist.
/// @dev Cost-tuned for Portaldot (pallet-revive charges a storage deposit per code byte and per
///      storage item):
///      - each fractionalize clones one shared Fraction implementation (EIP-1167, 45 bytes)
///        instead of deploying a fresh ~2 KB token contract;
///      - all per-receipt state is packed into 4 slots (at most 2 written when locking);
///      - batch read helpers for the UI (rows/settlements/statuses/balances/claimables) live in
///        the Lens contract, which is executed inside eth_call and never deployed.
contract Vault {
    uint256 public constant MAX_UNITS = 1e12; // whole units; token has 18 decimals
    uint256 public constant DUE_SOON = 3 days;

    IReceipt public immutable receipt;
    /// @notice The Fraction implementation every share token is a minimal-proxy clone of.
    address public immutable fractionImpl;

    struct Info {
        address fraction; uint64 dueDate; bool settled; // slot 0 (written on lock)
        address depositor; uint64 units;                 // slot 1 (written on lock)
        address token; uint96 faceValue;                 // slot 2 (terms / settle)
        uint128 amount; uint128 paidOut;                 // slot 3 (settle / claim)
    }
    mapping(uint256 => Info) private _info;
    uint256 private _lock = 1;

    /// None = not locked, Pending = locked & unpaid (not near due / no due date),
    /// DueSoon = due within DUE_SOON, Overdue = past due & unpaid, Settled = paid.
    enum Status { None, Pending, DueSoon, Overdue, Settled }

    event Fractionalized(uint256 indexed id, address indexed token, address indexed owner, uint256 units);
    event Redeemed(uint256 indexed id, address indexed by, address token);
    event TermsSet(uint256 indexed id, address indexed token, uint256 faceValue);
    event DueDateSet(uint256 indexed id, uint64 dueDate);
    event Settled(uint256 indexed id, address indexed payer, address indexed token, uint256 amount, uint256 supply);
    event Claimed(uint256 indexed id, address indexed holder, uint256 shares, uint256 payout);

    modifier nonReentrant() {
        req(_lock == 1, "reentrant");
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address receipt_) {
        req(receipt_ != address(0), "zero");
        receipt = IReceipt(receipt_);
        fractionImpl = address(new Fraction());
    }

    /// @dev Caller must own the receipt and have approved this Vault (approve / setApprovalForAll).
    function fractionalize(uint256 id, uint256 units) external returns (address token) {
        req(units > 0 && units <= MAX_UNITS, "units");
        Info storage i = _info[id];
        req(i.fraction == address(0), "already");
        _receiptTransfer(msg.sender, address(this), id); // reverts unless caller owns + approved
        address impl = fractionImpl;
        assembly {
            // EIP-1167 minimal proxy creation code (same layout as OpenZeppelin Clones)
            mstore(0x00, or(shr(0xe8, shl(0x60, impl)), 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000))
            mstore(0x20, or(shl(0x78, impl), 0x5af43d82803e903d91602b57fd5bf3))
            token := create(0, 0x09, 0x37)
        }
        req(token != address(0), "clone");
        ext(token, Fraction.init.selector, id, units * 1e18, uint160(msg.sender), 0);
        i.fraction = token;
        i.depositor = msg.sender;
        i.units = uint64(units);
        emit Fractionalized(id, token, msg.sender, units);
    }

    /// @dev Caller must hold every outstanding unit.
    function redeem(uint256 id) external nonReentrant {
        Info storage i = _info[id];
        address token = i.fraction;
        req(token != address(0), "not locked");
        req(!i.settled, "settled");
        uint256 total = _supply(token);
        req(_balance(token, msg.sender) == total, "need all units");
        delete _info[id]; // terms, due date and payout belong to this lock cycle only
        ext(token, Fraction.burnFrom.selector, uint160(msg.sender), total, 0, 0);
        _receiptTransfer(address(this), msg.sender, id);
        emit Redeemed(id, msg.sender, token);
    }

    // ---- settlement ------------------------------------------------------
    /// @notice Depositor fixes the payment token and face value once, so the debtor (anyone) can settle.
    function setTerms(uint256 id, address token, uint256 faceValue) external {
        _setTerms(id, token, faceValue);
    }

    /// @notice Same as setTerms plus a due date (unix seconds, must be in the future).
    function setTermsWithDue(uint256 id, address token, uint256 faceValue, uint64 dueDate) external {
        req(dueDate > block.timestamp, "due date");
        _setTerms(id, token, faceValue);
        _info[id].dueDate = dueDate;
        emit DueDateSet(id, dueDate);
    }

    function _setTerms(uint256 id, address token, uint256 faceValue) private {
        Info storage i = _info[id];
        req(i.fraction != address(0), "not locked");
        req(msg.sender == i.depositor, "not depositor");
        req(i.faceValue == 0 && !i.settled, "terms set");
        req(token != address(0) && token.code.length > 0, "token");
        req(faceValue > 0 && faceValue <= type(uint96).max, "amount");
        i.token = token;
        i.faceValue = uint96(faceValue);
        emit TermsSet(id, token, faceValue);
    }

    /// @notice Pay the invoice behind a locked receipt. Caller must have approved `amount` of `token`.
    /// @dev With terms set, anyone may pay (token must match, amount >= faceValue). Without terms, only
    ///      the depositor may settle — this stops a stranger "settling" with 1 wei of a junk token.
    ///      After settlement the NFT stays in the vault for good; shares become claim tickets.
    function settle(uint256 id, address token, uint256 amount) external nonReentrant {
        Info storage i = _info[id];
        req(i.fraction != address(0), "not locked");
        req(!i.settled, "settled");
        req(amount > 0, "amount");
        if (i.faceValue != 0) {
            req(token == i.token, "token");
            req(amount >= i.faceValue, "underpaid");
        } else {
            req(msg.sender == i.depositor, "no terms");
            req(token != address(0) && token.code.length > 0, "token");
            i.token = token;
        }
        // effects before the external pull; the received amount is re-measured afterwards
        i.settled = true;
        uint256 before = _balance(token, address(this));
        tokenCall(token, 0x23b872dd, uint160(msg.sender), uint160(address(this)), amount, "token transfer"); // transferFrom
        uint256 got = _balance(token, address(this)) - before; // fee-on-transfer safe
        req(got > 0, "nothing received");
        req(got <= type(uint128).max, "amount");
        i.amount = uint128(got);
        emit Settled(id, msg.sender, token, got, uint256(i.units) * 1e18);
    }

    /// @notice Burn all your shares of a settled receipt and receive your pro-rata payout.
    function claim(uint256 id) external nonReentrant returns (uint256 payout) {
        Info storage i = _info[id];
        req(i.settled, "not settled");
        address f = i.fraction;
        uint256 shares = _balance(f, msg.sender);
        req(shares > 0, "no shares");
        payout = _owed(i, shares, _supply(f));
        i.paidOut += uint128(payout);
        ext(f, Fraction.burnFrom.selector, uint160(msg.sender), shares, 0, 0);
        if (payout > 0) tokenCall(i.token, 0xa9059cbb, uint160(msg.sender), payout, 0, "token transfer"); // transfer
        emit Claimed(id, msg.sender, shares, payout);
    }

    /// @dev Rounds down; whoever burns the last outstanding shares gets the leftover dust, so
    ///      the pool always empties exactly and the sum paid never exceeds the amount received.
    ///      The supply at settlement is always units * 1e18 (nothing can burn before settlement
    ///      except a full redeem, which ends the lock cycle).
    function _owed(Info storage i, uint256 shares, uint256 outstanding) private view returns (uint256) {
        if (shares == outstanding) return i.amount - i.paidOut;
        return (uint256(i.amount) * shares) / (uint256(i.units) * 1e18);
    }

    function _receiptTransfer(address from, address to, uint256 id) private {
        ext(address(receipt), IReceipt.transferFrom.selector, uint160(from), uint160(to), id, 0);
    }

    function _balance(address token, address who) private view returns (uint256) {
        return sv(token, IERC20Min.balanceOf.selector, uint160(who), 0, 0);
    }

    function _supply(address token) private view returns (uint256) {
        return sv(token, Fraction.totalSupply.selector, 0, 0, 0);
    }

    // ---- reads (same ABI as before; batch helpers are in Lens) ---------------
    function fractionOf(uint256 id) external view returns (address) {
        return _info[id].fraction;
    }

    function depositorOf(uint256 id) external view returns (address) {
        return _info[id].depositor;
    }

    function dueDateOf(uint256 id) external view returns (uint64) {
        return _info[id].dueDate;
    }

    function isSettled(uint256 id) external view returns (bool) {
        return _info[id].settled;
    }

    /// @return token faceValue settled amount supply paidOut — supply is the pro-rata denominator (0 until settled)
    function settlementOf(uint256 id) external view returns (
        address token, uint256 faceValue, bool settled, uint256 amount, uint256 supply, uint256 paidOut)
    {
        Info storage i = _info[id];
        settled = i.settled;
        return (i.token, i.faceValue, settled, i.amount, settled ? uint256(i.units) * 1e18 : 0, i.paidOut);
    }

    function claimable(address who, uint256 id) external view returns (uint256) {
        Info storage i = _info[id];
        if (!i.settled) return 0;
        address f = i.fraction;
        uint256 shares = _balance(f, who);
        return shares == 0 ? 0 : _owed(i, shares, _supply(f));
    }

    function status(uint256 id) external view returns (Status) {
        Info storage i = _info[id];
        if (i.settled) return Status.Settled;
        if (i.fraction == address(0)) return Status.None;
        uint256 due = i.dueDate;
        if (due == 0) return Status.Pending;
        if (block.timestamp > due) return Status.Overdue;
        if (due - block.timestamp <= DUE_SOON) return Status.DueSoon;
        return Status.Pending;
    }

    function count() external view returns (uint256) {
        return sv(address(receipt), IReceipt.nextId.selector, 0, 0, 0) - 1;
    }
}
