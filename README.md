# Scripts for some common usages

these are some script to make the works easear and faster for me, you can execute them by `node` or if they have a package.json file, by `npm` commands.

## Contract Deployer

A flexible proxy contract that can call `buy` and `sell` methods on **any** target contract address. This proxy contract acts as a universal intermediary, allowing you to call specific functions on multiple different contracts through a standardized interface. This contract was developed to reduce limitation of user access to the bonding curve for buy and sell tokens.

## Role Assigner

This script is developed to generate safe transaction json file to assign a role to an address for intractiong with bonding curve. after generate the transaction, we need to import transaction in the transaction builder of safe UI of the workflow admin and execute it.

## Remove Payments Transaction Generator

This script is developed to generate safe transaction json files to remove some payment streams from payment processor. It will read the data from a batch minting report. after generate the transaction, we need to import transaction in the transaction builder of safe UI of the project funding pot multisig and execute it.

## Bonding Curve Data Collector

This script is getting some data from bonding curve, like prices, fees, and supplies.

## Push Payment Transaction Generator

This script is developed to generate safe transaction json files to push some payment streams to the payment processor. It will read the data from a batch minting report. after generate the transaction, we need to import transaction in the transaction builder of safe UI of the project funding pot multisig and execute it.


