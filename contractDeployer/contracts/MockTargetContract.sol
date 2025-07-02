// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title MockTargetContract
 * @dev A mock contract that implements the buyFor and sellTo functions for testing
 */
contract MockTargetContract {
    event BuyForCalled(
        address buyer,
        uint256 depositAmount,
        uint256 minAmountOut
    );
    event SellToCalled(
        address seller,
        uint256 depositAmount,
        uint256 minAmountOut
    );

    /**
     * @dev Mock buyFor function that just emits an event
     * @param _buyer The address of the buyer
     * @param _depositAmount The amount to deposit for buying
     * @param _minAmountOut The minimum amount to receive
     */
    function buyFor(
        address _buyer,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        emit BuyForCalled(_buyer, _depositAmount, _minAmountOut);
        // Mock successful execution
    }

    /**
     * @dev Mock sellTo function that just emits an event
     * @param _seller The address of the seller
     * @param _depositAmount The amount to deposit for selling
     * @param _minAmountOut The minimum amount to receive
     */
    function sellTo(
        address _seller,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        emit SellToCalled(_seller, _depositAmount, _minAmountOut);
        // Mock successful execution
    }
}
