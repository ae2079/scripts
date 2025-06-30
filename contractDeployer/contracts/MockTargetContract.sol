// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockTargetContract
 * @dev A mock contract that implements the buy and sell functions for testing
 */
contract MockTargetContract {
    
    event BuyCalled(uint256 depositAmount, uint256 minAmountOut);
    event SellCalled(uint256 depositAmount, uint256 minAmountOut);
    
    /**
     * @dev Mock buy function that just emits an event
     * @param _depositAmount The amount to deposit for buying
     * @param _minAmountOut The minimum amount to receive
     */
    function buy(uint256 _depositAmount, uint256 _minAmountOut) external {
        emit BuyCalled(_depositAmount, _minAmountOut);
        // Mock successful execution
    }
    
    /**
     * @dev Mock sell function that just emits an event
     * @param _depositAmount The amount to deposit for selling
     * @param _minAmountOut The minimum amount to receive
     */
    function sell(uint256 _depositAmount, uint256 _minAmountOut) external {
        emit SellCalled(_depositAmount, _minAmountOut);
        // Mock successful execution
    }
} 