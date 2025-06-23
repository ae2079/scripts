const { ethers } = require("ethers");

const amount = "2458.9699949";
const amountInWei = ethers.parseUnits(amount, 18);
console.log(amountInWei);

const amountInWeiString = amountInWei.toString();
console.log(amountInWeiString);