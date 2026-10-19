// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPotKit, IFraction} from "../../contracts/IPotKit.sol";

/// Second wallet of the demo (a contract here, so the whole flow fits in one simulated transaction).
contract Buyer {
    /// call PotKit as this wallet, paying `value` from its own balance
    function run(address k, bytes calldata data, uint256 value) external returns (bytes memory r) {
        bool ok;
        (ok, r) = k.call{value: value}(data);
        if (!ok) assembly { revert(add(r, 32), mload(r)) }
    }

    receive() external payable {}
}

/// Cost probe for scripts/measure.mjs — NEVER DEPLOYED. The constructor deploys PotKit and runs the first
/// `steps` steps of the 2-wallet demo flow; eth_estimateGas(steps = n) - eth_estimateGas(steps = n - 1)
/// is the on-chain cost (weight + storage deposit) of step n. steps = 99 runs everything and returns the
/// observed results instead of code, for eth_call verification.
contract Harness {
    constructor(bytes memory code, uint256 steps) payable {
        address k;
        assembly { k := create(0, add(code, 32), mload(code)) }
        require(k != address(0), "deploy");
        IPotKit p = IPotKit(k);
        Buyer b = new Buyer();
        payable(address(b)).transfer(0.01 ether); // fund the 2nd wallet
        uint256[16] memory out;
        if (steps == 0) return;
        // 1 mint (30-character note)
        uint256 id = p.mint(address(this), 0, "INV-2026-001 / Acme Corp 30d.");
        if (steps == 1) return;
        // 2 lock 100 shares, terms: 0.01 tPOT face value, no due date
        IFraction t = IFraction(p.fractionalize(id, 100, 0.01 ether, 0));
        if (steps == 2) return;
        // 3 list 40 shares at 0.0001 tPOT per share
        uint256 lid = p.list(id, 0.0001 ether, 40e18);
        if (steps == 3) return;
        // 4 the 2nd wallet buys all 40 shares (0.004 tPOT)
        uint256 s0 = address(this).balance;
        b.run(k, abi.encodeCall(IPotKit.buy, (lid, 40e18)), 0.004 ether);
        out[0] = address(this).balance - s0; // seller got paid
        out[1] = t.balanceOf(address(b));
        if (steps == 4) return;
        // 5 settle 0.01 tPOT
        p.settle{value: 0.01 ether}(id);
        if (steps == 5) return;
        // 6 + 7 both holders claim
        out[2] = p.claim(id);
        if (steps == 6) return;
        bytes memory r = b.run(k, abi.encodeCall(IPotKit.claim, (id)), 0);
        out[3] = abi.decode(r, (uint256));
        if (steps == 7) return;
        // 8 depositor redeems the receipt
        p.redeem(id);
        out[4] = p.ownerOf(id) == address(this) ? 1 : 0;
        out[5] = k.balance;
        out[6] = t.totalSupply();
        if (steps == 8) return;
        // 9 (extra) lock the same receipt again: reuses the share token
        address t2 = p.fractionalize(id, 10, 1 ether, 0);
        out[7] = t2 == address(t) ? 1 : 0;
        out[8] = k.code.length;
        out[9] = address(t).code.length;
        if (steps == 9) return;
        // native transfers of odd wei amounts (claim payouts are not rounded to the 1e4-wei planck)
        (bool okDust,) = payable(address(b)).call{value: 12345}("");
        out[10] = okDust ? 1 : 0;
        uint256 id2 = p.mint(address(this), 1, "dust");
        p.fractionalize(id2, 3, 1_000_000_001, 0);
        p.settle{value: 1_000_000_001}(id2);
        out[11] = p.claim(id2);
        bytes memory res = abi.encode(out, p.tokenURI(id), t.name(), t.symbol(), address(b).balance);
        assembly { return(add(res, 32), mload(res)) }
    }
}
