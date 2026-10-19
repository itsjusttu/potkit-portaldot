// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// test-only: ERC-721 receiver that accepts (or rejects) safe transfers and records the call
contract TestReceiver {
    bool public accept = true;
    address public lastOperator;
    address public lastFrom;
    uint256 public lastId;
    bytes public lastData;

    function setAccept(bool a) external {
        accept = a;
    }

    function onERC721Received(address operator, address from, uint256 id, bytes calldata data) external returns (bytes4) {
        lastOperator = operator;
        lastFrom = from;
        lastId = id;
        lastData = data;
        return accept ? this.onERC721Received.selector : bytes4(0xdeadbeef);
    }

    /// lets the contract act as a PotKit user (e.g. to test that native payouts to contracts work)
    function exec(address target, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
        if (!ok) assembly { revert(add(ret, 32), mload(ret)) }
        return ret;
    }

    receive() external payable {}
}
