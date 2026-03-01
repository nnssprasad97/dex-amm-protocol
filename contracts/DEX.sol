// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DEX is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // State variables
    address public tokenA;
    address public tokenB;
    
    // Tracking reserves internally to avoid dependency on balance calls which can be manipulated or inconsistent
    uint256 public reserveA;
    uint256 public reserveB;
    
    // Events
    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityMinted);
    event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidityBurned);
    event Swap(address indexed trader, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);
    
    /// @notice Initialize the DEX with two token addresses
    /// @param _tokenA Address of first token
    /// @param _tokenB Address of second token
    constructor(address _tokenA, address _tokenB) ERC20("DEX-LP", "DEX-LP") {
        require(_tokenA != address(0) && _tokenB != address(0), "Invalid token address");
        require(_tokenA != _tokenB, "Tokens must be different");
        tokenA = _tokenA;
        tokenB = _tokenB;
    }
    
    /// @notice Add liquidity to the pool
    /// @param amountA Amount of token A to add
    /// @param amountB Amount of token B to add
    /// @return liquidityMinted Amount of LP tokens minted
    function addLiquidity(uint256 amountA, uint256 amountB) 
        external 
        nonReentrant
        returns (uint256 liquidityMinted) {
        require(amountA > 0 && amountB > 0, "Amounts must be > 0");

        // Pull tokens first
        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountB);

        uint256 _totalSupply = totalSupply();
        
        if (_totalSupply == 0) {
            // First liquidity provider
            liquidityMinted = sqrt(amountA * amountB);
        } else {
            // Subsequent liquidity providers
            // Calculate proportional share based on current reserves
            uint256 amountAMint = (amountA * _totalSupply) / reserveA;
            uint256 amountBMint = (amountB * _totalSupply) / reserveB;
            liquidityMinted = amountAMint < amountBMint ? amountAMint : amountBMint;
        }

        require(liquidityMinted > 0, "Insufficient liquidity minted");

        _mint(msg.sender, liquidityMinted);
        _updateReserves(reserveA + amountA, reserveB + amountB);

        emit LiquidityAdded(msg.sender, amountA, amountB, liquidityMinted);
    }
    
    /// @notice Remove liquidity from the pool
    /// @param liquidityAmount Amount of LP tokens to burn
    /// @return amountA Amount of token A returned
    /// @return amountB Amount of token B returned
    function removeLiquidity(uint256 liquidityAmount) 
        external 
        nonReentrant
        returns (uint256 amountA, uint256 amountB) {
        require(liquidityAmount > 0, "Amount must be > 0");
        require(balanceOf(msg.sender) >= liquidityAmount, "Insufficient LP balance");

        uint256 _totalSupply = totalSupply();
        
        // Calculate amounts to return
        // amount = (liquidity / totalLiquidity) * reserve
        amountA = (liquidityAmount * reserveA) / _totalSupply;
        amountB = (liquidityAmount * reserveB) / _totalSupply;

        require(amountA > 0 && amountB > 0, "Insufficient amounts");

        _burn(msg.sender, liquidityAmount);
        
        // Send tokens back
        IERC20(tokenA).safeTransfer(msg.sender, amountA);
        IERC20(tokenB).safeTransfer(msg.sender, amountB);
        
        _updateReserves(reserveA - amountA, reserveB - amountB);

        emit LiquidityRemoved(msg.sender, amountA, amountB, liquidityAmount);
    }
    
    /// @notice Swap token A for token B
    /// @param amountAIn Amount of token A to swap
    /// @return amountBOut Amount of token B received
    function swapAForB(uint256 amountAIn) 
        external 
        nonReentrant
        returns (uint256 amountBOut) {
        require(amountAIn > 0, "Amount must be > 0");
        
        amountBOut = getAmountOut(amountAIn, reserveA, reserveB);
        
        require(amountBOut > 0, "Insufficient output amount");
        require(amountBOut < reserveB, "Insufficient liquidity");

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountAIn);
        IERC20(tokenB).safeTransfer(msg.sender, amountBOut);

        _updateReserves(reserveA + amountAIn, reserveB - amountBOut);
        
        emit Swap(msg.sender, tokenA, tokenB, amountAIn, amountBOut);
    }
    
    /// @notice Swap token B for token A
    /// @param amountBIn Amount of token B to swap
    /// @return amountAOut Amount of token A received
    function swapBForA(uint256 amountBIn) 
        external 
        nonReentrant
        returns (uint256 amountAOut) {
        require(amountBIn > 0, "Amount must be > 0");
        
        amountAOut = getAmountOut(amountBIn, reserveB, reserveA);
        
        require(amountAOut > 0, "Insufficient output amount");
        require(amountAOut < reserveA, "Insufficient liquidity");

        IERC20(tokenB).safeTransferFrom(msg.sender, address(this), amountBIn);
        IERC20(tokenA).safeTransfer(msg.sender, amountAOut);

        _updateReserves(reserveA - amountAOut, reserveB + amountBIn);
        
        emit Swap(msg.sender, tokenB, tokenA, amountBIn, amountAOut);
    }
    
    /// @notice Get current price of token A in terms of token B
    /// @return price Current price (reserveB / reserveA) * 1e18 precision
    function getPrice() external view returns (uint256 price) {
        require(reserveA > 0 && reserveB > 0, "Reserves empty");
        // Using 1e18 precision for price
        return (reserveB * 1e18) / reserveA;
    }
    
    /// @notice Get current reserves
    /// @return _reserveA Current reserve of token A
    /// @return _reserveB Current reserve of token B
    function getReserves() external view returns (uint256 _reserveA, uint256 _reserveB) {
        return (reserveA, reserveB);
    }
    
    /// @notice Get total liquidity (LP token supply)
    function totalLiquidity() external view returns (uint256) {
        return totalSupply();
    }

    /// @notice Calculate amount of token B received for given amount of token A
    /// @param amountIn Amount of input token
    /// @param reserveIn Reserve of input token
    /// @param reserveOut Reserve of output token
    /// @return amountOut Amount of output token (after 0.3% fee)
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) 
        public 
        pure 
        returns (uint256 amountOut) {
        require(amountIn > 0, "Insufficient input amount");
        require(reserveIn > 0 && reserveOut > 0, "Insufficient liquidity");
        
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        
        amountOut = numerator / denominator;
    }

    /// @notice Helper function to update internal reserve balances
    /// @param _reserveA New reserve balance for token A
    /// @param _reserveB New reserve balance for token B
    function _updateReserves(uint256 _reserveA, uint256 _reserveB) private {
        reserveA = _reserveA;
        reserveB = _reserveB;
    }

    /// @notice Helper function to calculate the square root of a number
    /// @param y The number to calculate the square root of
    /// @return z The square root of y
    function sqrt(uint256 y) internal pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }
}
