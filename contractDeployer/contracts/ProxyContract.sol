// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title FlexibleProxyContract
 * @dev A flexible proxy contract that can call buy and sell methods on any target contract
 */
contract FlexibleProxyContract {
    
    /**
     * @dev Proxy function to call buy method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _depositAmount The amount to deposit for buying
     * @param _minAmountOut The minimum amount to receive
     */
    function buy(address _targetContract, uint256 _depositAmount, uint256 _minAmountOut) external {
        require(_targetContract != address(0), "Target contract cannot be zero address");
        
        // Create the function call data for the target contract's buy function
        bytes memory callData = abi.encodeWithSignature(
            "buy(uint256,uint256)",
            _depositAmount,
            _minAmountOut
        );
        
        // Forward the call to the target contract
        (bool success, bytes memory returnData) = _targetContract.call(callData);
        
        // Check if the call was successful
        if (!success) {
            // If there's return data, try to decode it as a string for better error messages
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Buy call failed");
            }
        }
    }
    
    /**
     * @dev Proxy function to call sell method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _depositAmount The amount to deposit for selling
     * @param _minAmountOut The minimum amount to receive
     */
    function sell(address _targetContract, uint256 _depositAmount, uint256 _minAmountOut) external {
        require(_targetContract != address(0), "Target contract cannot be zero address");
        
        // Create the function call data for the target contract's sell function
        bytes memory callData = abi.encodeWithSignature(
            "sell(uint256,uint256)",
            _depositAmount,
            _minAmountOut
        );
        
        // Forward the call to the target contract
        (bool success, bytes memory returnData) = _targetContract.call(callData);
        
        // Check if the call was successful
        if (!success) {
            // If there's return data, try to decode it as a string for better error messages
            if (returnData.length > 0) {
                assembly {
                    let returndata_size := mload(returnData)
                    revert(add(32, returnData), returndata_size)
                }
            } else {
                revert("Sell call failed");
            }
        }
    }
}