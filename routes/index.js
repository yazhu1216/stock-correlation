var express = require('express');
var router = express.Router();
const stock = require('./modules/stock');

router.use('/', stock)

// router.use('/stock', stock);

module.exports = router;
