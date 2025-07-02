// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @dev Interface for ERC20 token operations
 */
interface IERC20 {
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) external returns (bool);

    function approve(address spender, uint256 amount) external returns (bool);

    function transfer(address to, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function allowance(
        address owner,
        address spender
    ) external view returns (uint256);
}

/**
 * @title FlexibleProxyContract
 * @dev A flexible proxy contract that can call buyFor and sellTo methods on any target contract
 */
contract FlexibleProxyContract {
    error NotAContract(address target);
    error CallFailed(address target, string reason);
    error TransferFailed(
        address token,
        address from,
        address to,
        uint256 amount
    );
    error ApprovalFailed(address token, address spender, uint256 amount);

    /**
     * @dev Proxy function to call buyFor method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _collateralToken The address of the collateral token to use for buying
     * @param _depositAmount The amount to deposit for buying
     * @param _minAmountOut The minimum amount to receive
     */
    function buy(
        address _targetContract,
        address _collateralToken,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        require(
            _targetContract != address(0),
            "Target contract cannot be zero address"
        );
        require(
            _collateralToken != address(0),
            "Collateral token cannot be zero address"
        );
        require(
            _isContract(_targetContract),
            "Target address is not a contract"
        );
        require(
            _isContract(_collateralToken),
            "Collateral token address is not a contract"
        );

        IERC20 collateralToken = IERC20(_collateralToken);

        // Transfer collateral tokens from caller to this contract
        bool transferSuccess = collateralToken.transferFrom(
            msg.sender,
            address(this),
            _depositAmount
        );
        if (!transferSuccess) {
            revert TransferFailed(
                _collateralToken,
                msg.sender,
                address(this),
                _depositAmount
            );
        }

        // Approve target contract to spend collateral tokens
        bool approveSuccess = collateralToken.approve(
            _targetContract,
            _depositAmount
        );
        if (!approveSuccess) {
            revert ApprovalFailed(
                _collateralToken,
                _targetContract,
                _depositAmount
            );
        }

        // Call buyFor(msg.sender, _depositAmount, _minAmountOut)
        bytes memory callData = abi.encodeWithSelector(
            0x935b7dbd, // buyFor(address,uint256,uint256)
            msg.sender,
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
                    "buyFor call failed or function does not exist"
                );
            }
        }
    }

    /**
     * @dev Proxy function to call sellTo method on any target contract
     * @param _targetContract The address of the contract to call
     * @param _tokenToSell The address of the token to sell
     * @param _depositAmount The amount to deposit for selling
     * @param _minAmountOut The minimum amount to receive
     */
    function sell(
        address _targetContract,
        address _tokenToSell,
        uint256 _depositAmount,
        uint256 _minAmountOut
    ) external {
        require(
            _targetContract != address(0),
            "Target contract cannot be zero address"
        );
        require(
            _tokenToSell != address(0),
            "Token to sell cannot be zero address"
        );
        require(
            _isContract(_targetContract),
            "Target address is not a contract"
        );
        require(
            _isContract(_tokenToSell),
            "Token to sell address is not a contract"
        );

        IERC20 tokenToSell = IERC20(_tokenToSell);

        // Transfer tokens from caller to this contract
        bool transferSuccess = tokenToSell.transferFrom(
            msg.sender,
            address(this),
            _depositAmount
        );
        if (!transferSuccess) {
            revert TransferFailed(
                _tokenToSell,
                msg.sender,
                address(this),
                _depositAmount
            );
        }

        // Approve target contract to spend tokens to sell
        bool approveSuccess = tokenToSell.approve(
            _targetContract,
            _depositAmount
        );
        if (!approveSuccess) {
            revert ApprovalFailed(
                _tokenToSell,
                _targetContract,
                _depositAmount
            );
        }

        // Call sellTo(msg.sender, _depositAmount, _minAmountOut)
        bytes memory callData = abi.encodeWithSelector(
            0xc5b27dde, // sellTo(address,uint256,uint256)
            msg.sender,
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
                    "sellTo call failed or function does not exist"
                );
            }
        }
    }

    /**
     * @dev Checks if the target contract is a contract
     * @param target The address to check
     * @return isInverter True if the contract is a contract
     */
    function isContract(
        address target
    ) external view returns (bool isInverter) {
        if (!_isContract(target)) return false;
        return true;
    }

    // Helper to decode string from bytes (for staticcall)
    function _decodeString(
        bytes memory data
    ) public pure returns (string memory) {
        return abi.decode(data, (string));
    }

    function _isContract(address _addr) internal view returns (bool) {
        return _addr.code.length > 0;
    }
}
