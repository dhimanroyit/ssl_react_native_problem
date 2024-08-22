const { Router } = require('express');
const { userAuthProtect } = require('../../middleware/auth');
const controllers = require('./paymentControllers');

const router = Router();

router.post('/', userAuthProtect, controllers.paymentWithOrder);

router.post('/success', controllers.paymentSuccess);

router.post('/fail', controllers.paymentFail);

router.post('/cancel', controllers.paymentCancel);

module.exports = router;
