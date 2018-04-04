var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");
var path = require('path')
var  jsSearch = require('js-search')
var http_port = process.env.HTTP_PORT || 80;
var p2p_port = process.env.P2P_PORT || 6001;
var initialNodes = [
    "http://127.0.0.1:6001/",
    "http://127.0.0.1:6002/"
];

class Block {
    constructor(index, previousHash, timestamp, data, hash) {
        this.index = index;
        this.previousHash = previousHash.toString();
        this.timestamp = timestamp;
        this.data = data;
        this.hash = hash.toString();
    }
}



var initHttpServer = () => {
    var app = express();
    app.set('view engine', 'ejs');
    app.use(bodyParser.json());
    app.use(express.static(path.join(__dirname, 'public')))

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));


    app.post('/addBlock', (req, res) => {
        var newBlock = generateNextBlock(req.body.data);
        addBlock(newBlock);
        broadcast(responseLatestMsg());

        res.json(newBlock);
    });


    app.get('/nodes', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });

    app.post('/addNode', (req, res) => {
        connectToNodes([req.body.node]);
        res.json({msg: 'success'});
    });

    app.get('/share/:hash', (req, res)=>{
        var hsah = req.params.hash
        var search = new jsSearch.Search('hash');
        search.addIndex('hash');
        search.addDocuments(blockchain);
        var data = search.search(hsah)
        var searchPeople = new jsSearch.Search('hash');
        searchPeople.addIndex(['data', 'hash']);
        searchPeople.addDocuments(blockchain);
        var people = searchPeople.search(hsah)
        //res.json(people)
        res.render(path.join(__dirname, 'public', 'share'),{
            data:data[0],
            people: JSON.stringify(people)           
        })
    })

    app.get('/checkUser/:id/:hsah',(req, res)=>{
        var id = req.params.id
        var hsah = req.params.hsah
        var searchPeople = new jsSearch.Search('hash');
        searchPeople.addIndex(['data', 'hash']);
        searchPeople.addDocuments(blockchain);
        var people = searchPeople.search(hsah)
        var check = people.find(x=> x.data.id == id) 
        if(check){
            res.json({status: false})
        }else{
            res.json({status: true})
        }
        
    })

    app.get('/supporters/:hsah',(req, res)=>{
        var id = req.params.id
        var hsah = req.params.hsah
        var searchPeople = new jsSearch.Search('hash');
        searchPeople.addIndex(['data', 'hash']);
        searchPeople.addDocuments(blockchain);
        var people = searchPeople.search(hsah)

        res.json(people)
        
    })


    app.get('**', (req, res)=>{
        res.render(path.join(__dirname, 'public', 'app'),{
            url:req.originalUrl
        })
    })

    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};


var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);

};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to node: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};


var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

var blockchain = []

var calculateHash = (index, previousHash, timestamp, data) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data).toString();
};

var getGenesisBlock = () => {
    return new Block(0, "0", 0, "0", calculateHash(0,"0",0,"0"));
};

blockchain.push(getGenesisBlock())

var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    var nextTimestamp = new Date().getTime() / 1000;
    var nextHash = calculateHash(nextIndex, previousBlock.hash, nextTimestamp, blockData);
    return new Block(nextIndex, previousBlock.hash, nextTimestamp, blockData, nextHash);
};


var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data);
};



var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
    }
};

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    } else if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid previoushash');
        return false;
    } else if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        return false;
    }
    return true;
};

var connectToNodes = (newNodes) => {
    newNodes.forEach((node) => {
        var ws = new WebSocket(node);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {        
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            broadcast(queryAllMsg());
        } else {
            replaceChain(receivedBlocks);
        }
    }
};

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {        
        blockchain = newBlocks;
        broadcast(responseLatestMsg());
    }
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }
    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};

var getLatestBlock = () => blockchain[blockchain.length - 1];
var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToNodes(initialNodes);
initHttpServer();
initP2PServer();