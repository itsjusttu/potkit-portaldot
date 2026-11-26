/// Test-only payee for the PotKit v2 testnet run (not part of the product, never used by the app).
/// - Refuses every plain tPOT transfer (empty calldata), so a PotKit payout to it fails and is credited.
/// - Its deployer (stored in slot 0) can make it call another contract: calldata = [32-byte target][call data],
///   forwarded with msg.value; a revert is bubbled up. Used to call PotKit.withdraw(to) as this contract.
object "TinyReceiver" {
    code {
        sstore(0, caller())
        datacopy(0, dataoffset("runtime"), datasize("runtime"))
        return(0, datasize("runtime"))
    }
    object "runtime" {
        code {
            if lt(calldatasize(), 32) { revert(0, 0) } // plain transfers (and anything malformed) are refused
            if iszero(eq(caller(), sload(0))) { revert(0, 0) } // only the deployer
            let n := sub(calldatasize(), 32)
            calldatacopy(0, 32, n)
            let ok := call(gas(), calldataload(0), callvalue(), 0, n, 0, 0)
            returndatacopy(0, 0, returndatasize())
            if iszero(ok) { revert(0, returndatasize()) }
            return(0, returndatasize())
        }
    }
}
