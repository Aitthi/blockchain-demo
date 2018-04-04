# blockchain-demo
 
### What is blockchain
[From Wikipedia](https://en.wikipedia.org/wiki/Blockchain_(database)) : Blockchain is a distributed database that maintains a continuously-growing list of records called blocks secured from tampering and revision.

### Key concepts of Naivechain
* HTTP interface to control the node
* Use Websockets to communicate with other nodes (P2P)
* Super simple "protocols" in P2P communication
* Data is not persisted in nodes
* No proof-of-work or proof-of-stake: a block can be added to the blockchain without competition


![alt tag](https://raw.githubusercontent.com/lhartikk/naivechain/master/naivechain_blockchain.png)

![alt tag](https://raw.githubusercontent.com/lhartikk/naivechain/master/naivechain_components.png)



### Quick start
```
npm install
npm start
```


### HTTP API
##### Get blockchain

##### Add node
```
curl -H "Content-type:application/json" --data '{"node" : "ws://localhost:6001"}' http://localhost:3001/addNode
```
#### Query connected nodes
```
curl http://localhost:3001/nodes
```
