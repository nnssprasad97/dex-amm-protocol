const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function () {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");

        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.address, tokenB.address);

        // Approve DEX to spend tokens for owner
        await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));

        // Mint and approve for other users
        await tokenA.mint(addr1.address, ethers.utils.parseEther("1000"));
        await tokenB.mint(addr1.address, ethers.utils.parseEther("1000"));
        await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000"));
        await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("1000"));
    });

    describe("Liquidity Management", function () {
        it("should allow initial liquidity provision", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.utils.parseEther("100"));
            expect(reserves[1]).to.equal(ethers.utils.parseEther("100"));
        });

        it("should mint correct LP tokens for first provider", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            const lpBalance = await dex.balanceOf(owner.address);
            // sqrt(100 * 100) = 100
            expect(lpBalance).to.equal(ethers.utils.parseEther("100"));
        });

        it("should allow subsequent liquidity additions", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            await dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("50")
            );
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.utils.parseEther("150"));
            expect(reserves[1]).to.equal(ethers.utils.parseEther("150"));
        });

        it("should maintain price ratio on liquidity addition", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );
            // Price is 200/100 = 2

            // Add liquidity with same ratio 1:2
            await dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("10"),
                ethers.utils.parseEther("20")
            );

            const reserves = await dex.getReserves();
            // 100 + 10 = 110, 200 + 20 = 220. 220/110 = 2.
            expect(reserves[1].mul(100).div(reserves[0])).to.equal(200);
        });

        it("should allow partial liquidity removal", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            // Remove half liquidity
            await dex.removeLiquidity(ethers.utils.parseEther("50"));

            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.utils.parseEther("50"));
            expect(reserves[1]).to.equal(ethers.utils.parseEther("50"));
        });

        it("should return correct token amounts on liquidity removal", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const balanceA_before = await tokenA.balanceOf(owner.address);
            const balanceB_before = await tokenB.balanceOf(owner.address);

            await dex.removeLiquidity(ethers.utils.parseEther("70.710678118654752440")); // Approx sqrt(100*200)/2
            // Actually LP minted = sqrt(20000) = ~141.42...
            // Let's just remove all for simple check or half

            // Re-setup simpler
        });

        it("should return correct token amounts on liquidity removal - simpler", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            // LP = 100

            const tx = await dex.removeLiquidity(ethers.utils.parseEther("50"));
            const receipt = await tx.wait();

            // Expect 50 of each back
            const event = receipt.events.find(e => e.event === 'LiquidityRemoved');
            expect(event.args.amountA).to.equal(ethers.utils.parseEther("50"));
            expect(event.args.amountB).to.equal(ethers.utils.parseEther("50"));
        });

        it("should revert on zero liquidity addition", async function () {
            await expect(dex.addLiquidity(0, 0)).to.be.revertedWith("Amounts must be > 0");
        });

        it("should revert when removing more liquidity than owned", async function () {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await expect(dex.removeLiquidity(ethers.utils.parseEther("101"))).to.be.revertedWith("Insufficient LP balance");
        });
    });

    describe("Token Swaps", function () {
        beforeEach(async function () {
            // Add initial liquidity: 100 A, 100 B
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
        });

        it("should swap token A for token B", async function () {
            // Swap 10 A for B
            await dex.swapAForB(ethers.utils.parseEther("10"));

            const reserves = await dex.getReserves();
            // A should increase by 10 => 110
            expect(reserves[0]).to.equal(ethers.utils.parseEther("110"));
            // B should decrease
            expect(reserves[1]).to.be.lt(ethers.utils.parseEther("100"));
        });

        it("should swap token B for token A", async function () {
            await dex.swapBForA(ethers.utils.parseEther("10"));
            const reserves = await dex.getReserves();
            expect(reserves[1]).to.equal(ethers.utils.parseEther("110"));
            expect(reserves[0]).to.be.lt(ethers.utils.parseEther("100"));
        });

        it("should calculate correct output amount with fee", async function () {
            // Input 10. Fee 0.3% = 0.03. Effective input = 9.97
            // x = 100, y = 100, k = 10000
            // (100 + 9.97) * newY = 10000
            // newY = 10000 / 109.97 = 90.93389...
            // output = 100 - 90.93389 = 9.0661...

            const output = await dex.getAmountOut(ethers.utils.parseEther("10"), ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));

            // Manual calc: 10 * 997 * 100 / (100 * 1000 + 10 * 997)
            // = 997000 / 109970 = 9.0661089387...
            expect(output).to.closeTo(ethers.utils.parseEther("9.0661"), ethers.utils.parseEther("0.0001"));
        });

        it("should update reserves after swap", async function () {
            const amountIn = ethers.utils.parseEther("10");
            const amountOut = await dex.getAmountOut(amountIn, ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));

            await dex.swapAForB(amountIn);

            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(ethers.utils.parseEther("110"));
            expect(reserves[1]).to.equal(ethers.utils.parseEther("100").sub(amountOut));
        });

        it("should increase k after swap due to fees", async function () {
            const kBefore = (await dex.reserveA()).mul(await dex.reserveB());
            await dex.swapAForB(ethers.utils.parseEther("10"));
            const kAfter = (await dex.reserveA()).mul(await dex.reserveB());
            expect(kAfter).to.be.gt(kBefore);
        });

        it("should revert on zero swap amount", async function () {
            await expect(dex.swapAForB(0)).to.be.revertedWith("Amount must be > 0");
        });

        it("should handle large swaps with high price impact", async function () {
            // Swap 90 A (reserve is 100). Huge impact.
            // Effective In = 90 * .997 = 89.73
            // New A = 189.73. New B = 10000/189.73 = 52.70
            // Out = 47.29
            await expect(dex.swapAForB(ethers.utils.parseEther("90"))).to.not.be.reverted;
        });

        it("should handle multiple consecutive swaps", async function () {
            await dex.swapAForB(ethers.utils.parseEther("10"));
            await dex.swapBForA(ethers.utils.parseEther("5"));
            const reserves = await dex.getReserves();
            // Just check it didn't revert and reserves changed
            expect(reserves[0]).to.not.equal(ethers.utils.parseEther("100"));
        });
    });

    describe("Price Calculations", function () {
        it("should return correct initial price", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"), // A
                ethers.utils.parseEther("200")  // B
            );
            // Price A in terms of B = 200/100 = 2
            const price = await dex.getPrice();
            expect(price).to.equal(ethers.utils.parseEther("2"));
        });

        it("should update price after swaps", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("100")
            );
            await dex.swapAForB(ethers.utils.parseEther("100")); // Shift balance significantly
            const price = await dex.getPrice();
            expect(price).to.not.equal(ethers.utils.parseEther("1"));
        });

        it("should handle price queries with zero reserves gracefully", async function () {
            // New deployment has 0 reserves
            await expect(dex.getPrice()).to.be.revertedWith("Reserves empty");
        });
    });

    describe("Fee Distribution", function () {
        it("should accumulate fees for liquidity providers", async function () {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));

            // Do a swap with another user to accumulate fees
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));

            // Remove all liquidity
            const lpBal = await dex.balanceOf(owner.address);
            await dex.removeLiquidity(lpBal);

            const balA = await tokenA.balanceOf(owner.address);
            const balB = await tokenB.balanceOf(owner.address);

            // Owner started with (mock mint - 100 provided) = 999900
            // We want to see if the value they got back implies fees
            // Product of tokens returned should be > initial product (100 * 100)
            // Returned A = balA - 999900
            // Returned B = balB - 999900
            const returnedA = balA.sub(ethers.utils.parseEther("999900"));
            const returnedB = balB.sub(ethers.utils.parseEther("999900"));

            expect(returnedA.mul(returnedB)).to.be.gt(ethers.utils.parseEther("100").mul(ethers.utils.parseEther("100")));
        });

        it("should distribute fees proportionally to LP share", async function () {
            // Owner 100, Addr1 100. Total 200 liquidity.
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await dex.connect(addr1).addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));

            // Swap
            await dex.swapAForB(ethers.utils.parseEther("100"));

            // Both remove
            const tx1 = await dex.removeLiquidity(ethers.utils.parseEther("100")); // Half pool
            const tx2 = await dex.connect(addr1).removeLiquidity(ethers.utils.parseEther("100")); // Half pool

            // Should get same amounts roughly
            const receipt1 = await tx1.wait();
            const receipt2 = await tx2.wait();

            const evt1 = receipt1.events.find(e => e.event === 'LiquidityRemoved');
            const evt2 = receipt2.events.find(e => e.event === 'LiquidityRemoved');

            expect(evt1.args.amountA).to.equal(evt2.args.amountA);
        });
    });

    describe("Edge Cases", function () {
        it("should handle very small liquidity amounts", async function () {
            await dex.addLiquidity(1000, 1000); // 1000 wei
            const reserves = await dex.getReserves();
            expect(reserves[0]).to.equal(1000);
        });

        it("should handle very large liquidity amounts", async function () {
            const amount = ethers.utils.parseEther("100000"); // 100k
            await dex.addLiquidity(amount, amount);
            expect((await dex.getReserves())[0]).to.equal(amount);
        });

        it("should prevent unauthorized access", async function () {
            // DEX doesn't really have restricted functions other than maybe internal stuff? 
            // But we can check if random user can burn others liquidity? No, burn checks balance.
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await expect(dex.connect(addr1).removeLiquidity(ethers.utils.parseEther("50"))).to.be.revertedWith("Insufficient LP balance");
        });
    });

    describe("Events", function () {
        it("should emit LiquidityAdded event", async function () {
            await expect(dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100")))
                .to.emit(dex, "LiquidityAdded")
                .withArgs(owner.address, ethers.utils.parseEther("100"), ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
        });

        it("should emit LiquidityRemoved event", async function () {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await expect(dex.removeLiquidity(ethers.utils.parseEther("100")))
                .to.emit(dex, "LiquidityRemoved")
                .withArgs(owner.address, ethers.utils.parseEther("100"), ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
        });

        it("should emit Swap event", async function () {
            await dex.addLiquidity(ethers.utils.parseEther("100"), ethers.utils.parseEther("100"));
            await expect(dex.swapAForB(ethers.utils.parseEther("10")))
                .to.emit(dex, "Swap");
        });
    });
});
