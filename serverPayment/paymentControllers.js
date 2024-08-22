const SSLCommerzPayment = require('sslcommerz-lts');
const crypto = require('crypto');
const OrderModel = require('../order/orderModel');
const ProductModel = require('../product/productModel');
const responseHandler = require('../../utils/responseHandler');
const config = require('../../config');

const sslcz = new SSLCommerzPayment(
  config.sslStoreId,
  config.sslStorePass,
  config.sslIsLive === 'true' ? true : false
);

const paymentWithOrder = (req, res, next) => {
  const {
    amount,
    deliveryAddress: { streetAddress, phoneNumber, fullName },
    carts,
  } = req.body;

  const transactionId = crypto.randomBytes(16).toString('hex').toUpperCase();

  const productsDtls = carts.reduce(
    (prevValue, currentValue) => {
      return {
        productName: `${
          prevValue.productName ? prevValue.productName + ',' : ''
        } ${currentValue.productName}`,
        productCategory: `${
          prevValue.productCategory ? prevValue.productCategory + ' or' : ''
        } ${currentValue.productCategory}`,
      };
    },
    { productName: '', productCategory: '' }
  );

  const data = {
    total_amount: amount,
    currency: 'BDT',
    tran_id: `${transactionId}`, // use unique tran_id for each api call
    success_url: `${config.serverUrl}/v1/payment/success?tranId=${transactionId}`,
    fail_url: `${config.serverUrl}/v1/payment/fail?tranId=${transactionId}`,
    cancel_url: `${config.serverUrl}/v1/payment/cancel?tranId=${transactionId}`,
    shipping_method: 'Courier',
    product_name: `${productsDtls.productName}`,
    product_category: `${productsDtls.productCategory}`,
    product_profile: 'general',
    cus_name: fullName ?? phoneNumber,
    cus_email: 'customer@example.com',
    cus_add1: streetAddress,
    cus_add2: streetAddress,
    cus_city: 'Dhaka',
    cus_state: 'Dhaka',
    cus_postcode: '1000',
    cus_country: 'Bangladesh',
    cus_phone: phoneNumber,
    cus_fax: phoneNumber,
    ship_name: fullName ?? phoneNumber,
    ship_add1: streetAddress,
    ship_add2: streetAddress,
    ship_city: 'Dhaka',
    ship_state: 'Dhaka',
    ship_postcode: 1000,
    ship_country: 'Bangladesh',
  };

  sslcz.init(data).then(async (sslRes) => {
    if (sslRes.status === 'FAILED') {
      res.json({
        statusCode: 400,
        error: true,
        message: sslRes.failedreason,
      });
    } else if (sslRes.status === 'SUCCESS') {
      let { GatewayPageURL, sessionkey } = sslRes;
      try {
        const { carts } = req.body;
        const cartsProducts = await Promise.all(
          carts.map(async (order) => {
            const product = await ProductModel.findById(order.productId)
              .lean()
              .exec();
            return {
              quantity: order.quantity,
              price: order.price,
              product: { ...product },
            };
          })
        );

        const body = {
          userId: req.user._id,
          ...req.body,
          carts: cartsProducts,
          payment: {
            transactionId: transactionId,
            sslSessionKey: sessionkey,
          },
        };
        const createOrder = new OrderModel(body);
        await createOrder.save();
        const resDoc = responseHandler(
          200,
          'payment url get successfully',
          GatewayPageURL
        );
        res.status(200).json(resDoc);
      } catch (err) {
        next(err);
      }
    }
  });
};

const paymentSuccess = (req, res, next) => {
  const { tranId } = req.query;
  const data = { tran_id: tranId };
  sslcz.transactionQueryByTransactionId(data).then(async (sslRes) => {
    const {
      no_of_trans_found,
      element: [{ status, amount }],
    } = sslRes;
    if (no_of_trans_found === 1 && status === 'VALID') {
      const paidAmount = parseInt(amount);
      console.log({ paidAmount });
      try {
        const order = await OrderModel.findOne({
          'payment.transactionId': tranId,
        })
          .lean()
          .exec();
        const { grandTotal, orderId } = order;
        const payment = {
          paid: {
            amount: paidAmount,
            method: 'ssl commerce',
          },
          payable: {
            amount: grandTotal - amount,
            method: 'cash on delivery',
          },
        };

        if (amount < grandTotal) {
          payment.status = 'partial';
        } else if (amount === grandTotal) {
          payment.status = 'paid';
        }

        await OrderModel.findOneAndUpdate(
          { 'payment.transactionId': tranId },
          {
            $set: {
              'orderStatus.type': 'success',
              'orderStatus.message': 'successfully done',
              'payment.status': payment.status,
              'payment.paid': payment.paid,
              'payment.payable': payment.payable,
            },
          }
        );
        res.redirect(`${config.clientServerUrl}/order-done?orderId=${orderId}`);
      } catch (err) {
        next(err);
      }
    }
  });
};

const paymentFail = async (req, res, next) => {
  const { tranId } = req.query;
  try {
    const order = await OrderModel.findOne({
      'payment.transactionId': tranId,
    })
      .lean()
      .exec();
    const { grandTotal } = order;
    const payment = {
      status: 'unpaid',
      paid: {
        amount: 0,
        method: 'ssl commerce',
      },
      payable: {
        amount: grandTotal,
        method: 'cash on delivery',
      },
    };

    await OrderModel.findOneAndUpdate(
      { 'payment.transactionId': tranId },
      {
        $set: {
          'orderStatus.type': 'fail',
          'orderStatus.message': 'failed by ssl',
          'payment.status': payment.status,
          'payment.paid': payment.paid,
          'payment.payable': payment.payable,
        },
      }
    );
    res.redirect(`${config.clientServerUrl}/checkout?status=fail`);
  } catch (err) {
    next(err);
  }
};

const paymentCancel = async (req, res, next) => {
  const { tranId } = req.query;
  try {
    const order = await OrderModel.findOne({
      'payment.transactionId': tranId,
    })
      .lean()
      .exec();
    const { grandTotal } = order;
    const payment = {
      status: 'unpaid',
      paid: {
        amount: 0,
        method: 'ssl commerce',
      },
      payable: {
        amount: grandTotal,
        method: 'cash on delivery',
      },
    };

    await OrderModel.findOneAndUpdate(
      { 'payment.transactionId': tranId },
      {
        $set: {
          'orderStatus.type': 'cancel',
          'orderStatus.message': 'canceled by user when payment',
          'payment.status': payment.status,
          'payment.paid': payment.paid,
          'payment.payable': payment.payable,
        },
      }
    );
    res.redirect(`${config.clientServerUrl}/checkout?status=cancel`);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  paymentWithOrder,
  paymentSuccess,
  paymentFail,
  paymentCancel,
};
