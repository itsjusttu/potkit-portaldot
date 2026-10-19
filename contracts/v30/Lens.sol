// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReceiptL {
    function ownerOf(uint256 id) external view returns (address);
    function kindOf(uint256 id) external view returns (uint8);
    function note(uint256 id) external view returns (string memory);
}

interface IFractionL {
    function totalSupply() external view returns (uint256);
    function balanceOf(address who) external view returns (uint256);
}

interface IVaultL {
    function receipt() external view returns (IReceiptL);
    function count() external view returns (uint256);
    function fractionOf(uint256 id) external view returns (address);
    function depositorOf(uint256 id) external view returns (address);
    function dueDateOf(uint256 id) external view returns (uint64);
    function status(uint256 id) external view returns (uint8);
    function claimable(address who, uint256 id) external view returns (uint256);
    function settlementOf(uint256 id) external view returns (
        address token, uint256 faceValue, bool settled, uint256 amount, uint256 supply, uint256 paidOut);
}

interface IMarketL {
    struct Listing { address seller; address fraction; address payToken; uint256 price; uint256 remaining; uint256 receiptId; }
    function count() external view returns (uint256);
    function listing(uint256 listingId) external view returns (Listing memory);
}

/// @title Lens — batch reads for the PotKit UI. NEVER DEPLOYED.
/// @notice The frontend runs this contract's bytecode inside a plain `eth_call` (viem "deployless"
///         read: readContract({ code })), so these helpers cost nothing on-chain and add no storage
///         deposit to the Vault / Market. Every function only uses the contracts' public getters, so
///         anyone can verify the results.
contract Lens {
    struct Row {
        uint256 id;
        address owner; // == vault while locked
        uint8 kind;
        string note;
        address fraction;
        address depositor;
        uint256 supply;
    }

    struct Settlement {
        address token;
        uint256 faceValue;
        bool settled;
        uint256 amount;
        uint256 supply;
        uint256 paidOut;
    }

    /// @dev receipt ids are 1-based: window [start, start+limit) clipped to [1, count], max 50.
    function _range(IVaultL v, uint256 start, uint256 limit) private view returns (uint256, uint256) {
        uint256 last = v.count();
        if (start == 0) start = 1;
        if (limit > 50) limit = 50;
        if (start > last || limit == 0) return (start, 0);
        uint256 n = last - start + 1;
        return (start, n > limit ? limit : n);
    }

    function rows(IVaultL v, uint256 start, uint256 limit) external view returns (Row[] memory out) {
        uint256 n;
        (start, n) = _range(v, start, limit);
        IReceiptL r = v.receipt();
        out = new Row[](n);
        for (uint256 i; i < n; i++) {
            uint256 id = start + i;
            address token = v.fractionOf(id);
            out[i] = Row(id, r.ownerOf(id), r.kindOf(id), r.note(id), token, v.depositorOf(id),
                token == address(0) ? 0 : IFractionL(token).totalSupply());
        }
    }

    function settlements(IVaultL v, uint256 start, uint256 limit) external view returns (Settlement[] memory out) {
        uint256 n;
        (start, n) = _range(v, start, limit);
        out = new Settlement[](n);
        for (uint256 i; i < n; i++) {
            Settlement memory s = out[i];
            (s.token, s.faceValue, s.settled, s.amount, s.supply, s.paidOut) = v.settlementOf(start + i);
        }
    }

    /// @return st status (Vault.Status) and dd due date for each id
    function statuses(IVaultL v, uint256 start, uint256 limit) external view returns (uint8[] memory st, uint64[] memory dd) {
        uint256 n;
        (start, n) = _range(v, start, limit);
        st = new uint8[](n);
        dd = new uint64[](n);
        for (uint256 i; i < n; i++) {
            st[i] = v.status(start + i);
            dd[i] = v.dueDateOf(start + i);
        }
    }

    /// @return bal share balance of `who` for each id (0 if not locked)
    function balances(IVaultL v, address who, uint256 start, uint256 limit) external view returns (uint256[] memory bal) {
        uint256 n;
        (start, n) = _range(v, start, limit);
        bal = new uint256[](n);
        for (uint256 i; i < n; i++) {
            address token = v.fractionOf(start + i);
            if (token != address(0)) bal[i] = IFractionL(token).balanceOf(who);
        }
    }

    /// @return c claimable payout of `who` for each id
    function claimables(IVaultL v, address who, uint256 start, uint256 limit) external view returns (uint256[] memory c) {
        uint256 n;
        (start, n) = _range(v, start, limit);
        c = new uint256[](n);
        for (uint256 i; i < n; i++) c[i] = v.claimable(who, start + i);
    }

    /// @return out market listings [start, start+limit), max 50 (listing ids are 0-based)
    function listings(IMarketL m, uint256 start, uint256 limit) external view returns (IMarketL.Listing[] memory out) {
        uint256 n = m.count();
        if (limit > 50) limit = 50;
        if (start >= n || limit == 0) return out;
        if (n - start < limit) limit = n - start;
        out = new IMarketL.Listing[](limit);
        for (uint256 i; i < limit; i++) out[i] = m.listing(start + i);
    }
}
