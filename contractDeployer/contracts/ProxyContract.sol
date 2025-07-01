// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FlexibleProxyContract
 * @dev A flexible proxy contract that can call buy and sell methods on any target contract
 */
contract FlexibleProxyContract {
    error NotAContract(address target);
    error CallFailed(address target, string reason);
    error MissingFunction(address target, string functionSignature);

    /**
     * @dev Proxy function to call buy method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _depositAmount The amount to deposit for buying
     * @param _minAmountOut The minimum amount to receive
     */
    function buy(
        address _targetContract,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        require(
            _targetContract != address(0),
            "Target contract cannot be zero address"
        );
        require(
            _isContract(_targetContract),
            "Target address is not a contract"
        );
        require(
            _hasFunction(_targetContract, "buy(uint256,uint256)"),
            "Target contract does not have buy(uint256,uint256)"
        );

        bytes memory callData = abi.encodeWithSignature(
            "buy(uint256,uint256)",
            _depositAmount,
            _minAmountOut
        );

        (bool success, bytes memory returnData) = _targetContract.call(
            callData
        );

        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert CallFailed(
                    _targetContract,
                    "Buy call failed or function does not exist"
                );
            }
        }
    }

    /**
     * @dev Proxy function to call sell method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _depositAmount The amount to deposit for selling
     * @param _minAmountOut The minimum amount to receive
     */
    function sell(
        address _targetContract,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        require(
            _targetContract != address(0),
            "Target contract cannot be zero address"
        );
        require(
            _isContract(_targetContract),
            "Target address is not a contract"
        );
        require(
            _hasFunction(_targetContract, "sell(uint256,uint256)"),
            "Target contract does not have sell(uint256,uint256)"
        );

        bytes memory callData = abi.encodeWithSignature(
            "sell(uint256,uint256)",
            _depositAmount,
            _minAmountOut
        );

        (bool success, bytes memory returnData) = _targetContract.call(
            callData
        );

        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert CallFailed(
                    _targetContract,
                    "Sell call failed or function does not exist"
                );
            }
        }
    }

    /**
     * @dev Read function to check if the provided target address has buy and sell methods
     * @param target The address to check
     * @return hasBuy True if buy(uint256,uint256) exists, hasSell True if sell(uint256,uint256) exists
     */
    function hasBuyAndSell(
        address target
    ) external view returns (bool hasBuy, bool hasSell) {
        hasBuy = _hasFunction(target, "buy(uint256,uint256)");
        hasSell = _hasFunction(target, "sell(uint256,uint256)");
    }

    function _hasFunction(
        address target,
        string memory sig
    ) internal view returns (bool) {
        if (!_isContract(target)) return false;
        bytes4 selector = bytes4(keccak256(bytes(sig)));
        (bool success, ) = target.staticcall(
            abi.encodeWithSelector(selector, uint256(0), uint256(0))
        );
        return success;
    }

    function _isContract(address _addr) internal view returns (bool) {
        return _addr.code.length > 0;
    }
}
