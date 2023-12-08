// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { Ownable } from "openzeppelin-contracts/access/Ownable.sol";
// import { OwnerManager as SafeOwnerManager } from "safe-contracts/base/OwnerManager.sol";

/// @dev MPX25519 facilitates multi-party X25519 and MPECDH in general.
abstract contract MPX25519 is Ownable {
    /// @dev Signals signer whether to proceed with ceremony.
    enum Step {
        End,
        Ok,
        Idle
    }

    // /// @dev Safe.
    // address public immutable safe;
    /// @dev Copy of the safe's signers that serves as slot base.
    address[] public signers;
    /// @dev Signers' key queues mapping from slot to intermediate keys.
    mapping(uint256 => bytes32[]) public queues;
    /// @dev Processed counter per signer.
    mapping(uint256 => uint256) public processed;

    /**
     * @dev Only allows the safe's current signer set.
     */
    modifier onlySafeSigners() {
        // address[] memory _signers = SafeOwnerManager(safe).getOwners();
        address[] memory _signers = _getSigners();
        bool _isSigner = false;
        for (uint256 _i = 0; _i < _signers.length; _i++) {
            if (_msgSender() == _signers[_i]) {
                _isSigner = true;
                break;
            }
        }
        require(_isSigner, "only safe signers");
        _;
    }

    function _getSigners() internal virtual view returns (address[] memory);

    /**
     * @dev Constructs an accessoir that enables deriving a shared secret 
     * among all signers of a safe. Must be deployed through a safe.
     */
    constructor() Ownable(_msgSender()) {
        // safe = _msgSender();
        // signers = SafeOwnerManager(safe).getOwners();
        signers = _getSigners();
    }

    /**
     * @dev Resets the signer set to the safe's current one.
     * Safes must call this method whenever their signer set has changed.
     */
    function reconstruct() external onlyOwner {
        for (uint256 _i = 0; _i < signers.length; _i++) {
            delete queues[_i];
        }
        // signers = SafeOwnerManager(safe).getOwners();
        signers = _getSigners();
    }

    /**
     * @dev Iterate all intermediate keys to process.
     * Step.End status 0 means there are no more steps for given signer.
     * @param _signer Signer address
     * @return _status ,_key
     */
    function prep(
        address _signer
    ) external view returns (Step _status, bytes32 _key) {
        uint256 _sourceSlot = source(_signer);
        uint256 _targetSlot = target(_sourceSlot);
        require(_targetSlot != type(uint256).max, "no such slot");
        if (queues[_targetSlot].length == signers.length - 1) {
            return (Step.End, queues[_sourceSlot][processed[_sourceSlot] - 1]);
        } else if (queues[_targetSlot].length <= queues[_sourceSlot].length) {
            return (Step.Ok, queues[_sourceSlot][processed[_sourceSlot] - 1]);
        } else {
            return (Step.Idle, bytes32(0));
        }
    }

    /**
     * @dev Submits an intermediate key.
     * @param _key New key
     */
    function step(bytes32 _key) external onlySafeSigners {
        uint256 _sourceSlot = source(_msgSender());
        uint256 _processed = processed[_sourceSlot];
        for (uint256 _i = 0; _i < signers.length; _i++) {
            if (_i != _sourceSlot) {
                require(
                    processed[_i] == _processed ||
                        processed[_i] - 1 == _processed,
                    "previous round not yet complete"
                );
            }
        }
        uint256 _targetSlot = target(_sourceSlot);
        require(_targetSlot != type(uint256).max, "no such slot");
        if (queues[_targetSlot].length < signers.length - 1) {
            queues[_targetSlot].push(_key);
        }
    }

    /**
     * @dev Signals that a signer has completed a step.
     */
    function done() external onlySafeSigners {
        processed[source(_msgSender())] += 1;
    }

    /**
     * @dev Get the signer's abstract slot.
     * A type(uint256).max return value indicates that the msg.sender is not
     * part of the stored signer set.
     * @param _signer Signer address
     * @return _slot Signer slot
     */
    function source(address _signer) public view returns (uint256 _slot) {
        for (uint256 _i = 0; _i < signers.length; _i++) {
            if (_signer == signers[_i]) {
                return _i;
            }
        }
        return type(uint256).max;
    }

    /**
     * @dev Get the next signer's slot doing round-robin.
     * A type(uint256).max return value indicates that _sourceSlot is not
     * among the stored signer set.
     * @param _sourceSlot Source slot
     * @return _slot Neighbor slot
     */
    function target(uint256 _sourceSlot) public view returns (uint256 _slot) {
        if (_sourceSlot == type(uint256).max || _sourceSlot >= signers.length) {
            return type(uint256).max;
        } else if (_sourceSlot == signers.length - 1) {
            return 0;
        } else {
            return _sourceSlot + 1;
        }
    }

    /**
     * @dev Get the stored list of Safe signers.
     * @return _signers Array of Safe signers.
     */
    function getSigners() public view returns (address[] memory _signers) {
        return signers;
    }

    /**
     * @dev Get an internal queue.
     * @param _slot Signer slot
     * @return _signers Array of intermediate keys.
     */
    function getQueue(uint256 _slot) public view returns (bytes32[] memory) {
        return queues[_slot];
    }
}
