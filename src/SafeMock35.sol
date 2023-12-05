// SPDX-License-Identifier: MIT

pragma solidity ^0.8.19;

import { OwnerManager as SafeOwnerManager } from "safe-contracts/base/OwnerManager.sol";

contract SafeMock35 is SafeOwnerManager {
    constructor(address[] memory _owners) {
        require(_owners.length == 5);
        setupOwners(_owners, 3);
    }

    function exec(
        address _to,
        bytes memory _data,
        uint256 _gas
    ) internal returns (bool success) {
        /* solhint-disable no-inline-assembly */
        /// @solidity memory-safe-assembly
        assembly {
            success := call(_gas, _to, 0, add(_data, 0x20), mload(_data), 0, 0)
        }
        /* solhint-enable no-inline-assembly */
    }
}
