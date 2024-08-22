import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native'
import PageHeaderTitle from '../../../../components/PageHeaderTitle/PageHeaderTitle';
import { MaterialIcons, MaterialCommunityIcons } from 'react-native-vector-icons'
import PaymentMethodItem from '../../components/PaymentMethodItem/PaymentMethodItem';
import CustomStatusBar from '../../../../components/CustomStatusBar/CustomStatusBar';
import ConfirmationBtn from '../../../../components/ConfirmationBtn/ConfirmationBtn'
import Modal from "react-native-modal";
import { WebView } from 'react-native-webview';
import axiosHttpToken from '../../../../services/axiosInstance/axiosHttpToken';

import styles from './PaymentMethodPage.style'
import SummaryItem from '../../components/SummaryItem/SummaryItem';
import SuccessFullMessage from '../../components/SuccessFullMessage/SuccessFullMessage';
import AddressItem from '../../components/AddressItem/AddressItem';
import AddressAddBtn from '../../../Address/components/AddressAddBtn/AddressAddBtn';
import { useCartContext } from '../../../../context/CartContext';
import localStorage from '../../../../services/localStorage/localStorage';


const PaymentMethodPage = ({ navigation }) => {

    const [showModal, setShowModal] = useState(false);
    const [deliveryAddress, setDeliveryAddress] = useState(null);
    const [deliveryCost, setDeliveryCost] = useState(0);
    const [isCashOn, setIsCashOn] = useState(true);
    const [isOnlinePay, setIsOnlinePay] = useState(false);
    const [orderId, setOrderId] = useState('')
    const [onlinePaymentUrl, setOnlinePaymentUrl] = useState('');
    const [orderStatus, setOrderStatus] = useState('');
    const [isWebView, setIsWebView] = useState(false);

    const { cartItems, totalAmount, removeAll } = useCartContext();
    let webview = null;

    const paymentMethod = [
        {
            id: 1,
            title: 'Cash On Delivery',
            icon: MaterialCommunityIcons,
            iconName: 'truck-delivery-outline',
            select: isCashOn,
            paymentHandler: () => {
                setIsCashOn(true);
                setIsOnlinePay(false);
                localStorage.setItem('onlinePayment', false)
            }
        },
        {
            id: 2,
            title: 'Payment On Online',
            icon: MaterialIcons,
            iconName: 'payments',
            select: isOnlinePay,
            paymentHandler: () => {
                setIsOnlinePay(true);
                setIsCashOn(false)
                localStorage.setItem('onlinePayment', true)
            }
        },
    ]
    const grandTotal = totalAmount + deliveryCost;


    const deliveryAddressHandler = async () => {
        try {
            const { data: { data: { addresses } } } = await axiosHttpToken.get(`/users/me/addresses`);
            if (addresses?.length) {
                const selectDeliveryAddress = addresses.filter(({ isDeliveryAddress }) => isDeliveryAddress === true);
                const [address] = selectDeliveryAddress;
                const deliveryAddress = { ...address };
                delete deliveryAddress.isDeliveryAddress;
                setDeliveryAddress(deliveryAddress);
            }
        } catch (err) {
            console.log(err)
        }
    }

    const handleModal = () => {
        setShowModal(!showModal)
    }

    const cashOnDeliveryHandler = async () => {
        const updateCartItems = cartItems.map((product) => ({
            productId: product._id,
            productName: product.name,
            productCategory: product.category.name,
            quantity: product.quantity,
            price: product.price.sellPrice,
        }));
        const cashOnOrder = {
            amount: 0,
            deliveryCharge: deliveryCost,
            couponDiscount: 0,
            subTotal: totalAmount,
            grandTotal: grandTotal,
            deliveryAddress: {
                ...deliveryAddress
            },
            carts: [...updateCartItems],
        }

        try {
            const { data } = await axiosHttpToken.post('/orders', { ...cashOnOrder })
            console.log('cashOn res', data)
            setOrderId(data.data.orderId);
            setOrderStatus('Success')
            setShowModal(true);
            removeAll();

        } catch (err) {
            console.log(err)
        }

    }


    const onPayment = async (data) => {
        const updateCartItems = cartItems.map((product) => ({
            productId: product._id,
            productName: product.name,
            productCategory: product.category.name,
            quantity: product.quantity,
            price: product.price.sellPrice,
        }));
        const paymentOrder = {
            amount: grandTotal,
            deliveryCharge: deliveryCost,
            couponDiscount: 0,
            subTotal: totalAmount,
            grandTotal: grandTotal,
            deliveryAddress: {
                ...deliveryAddress
            },
            carts: [...updateCartItems],
        }

        console.log({ paymentOrder });
        try {
            const { data } = await axiosHttpToken.post('/payment', { ...paymentOrder })
            console.log('payment res', data)
            setOnlinePaymentUrl(data.data);
            setIsWebView(true);


        } catch (err) {
            console.log(err)
        }

    }


    useEffect(() => {
        deliveryAddressHandler()
        const deliveryCostArr = cartItems.map(({ deliveryCharge }) => deliveryCharge)
        const deliveryCost = Math.max(...deliveryCostArr);
        setDeliveryCost(deliveryCost);
        const reRenderScreen = navigation.addListener('focus', () => deliveryAddressHandler())
        return reRenderScreen;
    }, [navigation])

    useEffect(() => {
        (async () => {
            const isOnlinePayment = await localStorage.get("onlinePayment");
            // console.log({isOnlinePayment});
            // console.log(typeof isOnlinePayment);
            if (isOnlinePayment === "true") {
                setIsOnlinePay(true);
                setIsCashOn(false)
            } if (isOnlinePayment === "false") {
                setIsCashOn(true);
                setIsOnlinePay(false)
            }
        })()
    }, [])


    return (
        <View style={styles.container}>
            <CustomStatusBar />
            <PageHeaderTitle pageTitleText={'Checkout'} />

            {!deliveryAddress && <AddressAddBtn />}
            <View style={styles.body}>

                {deliveryAddress && <AddressItem
                    fullName={deliveryAddress?.fullName}
                    phoneNumber={deliveryAddress?.phoneNumber}
                    area={deliveryAddress?.area}
                    streetAddress={deliveryAddress?.streetAddress} />}

                {
                    paymentMethod.map(paymentItem =>
                        <PaymentMethodItem
                            key={paymentItem.id}
                            title={paymentItem.title}
                            Icon={paymentItem.icon}
                            id={paymentItem.id}
                            iconName={paymentItem.iconName}
                            handleSelectIcon={paymentItem.paymentHandler}
                            selectIcon={paymentItem.select}
                        />
                    )
                }
                <View style={styles.summary}>
                    <Text style={styles.summaryText}>Totals Summary</Text>
                    <SummaryItem title={'Subtotal'} amount={totalAmount} />
                    <SummaryItem title={'Delivery Fee'} amount={deliveryCost} />
                    <View style={styles.dashedBorder}></View>
                    <SummaryItem title={'Total Amount'} amount={totalAmount + deliveryCost} />
                </View>
            </View>

            <ConfirmationBtn
                title={(isCashOn && !isOnlinePay) ? 'Order' : 'Order & Pay'}
                showConfirm
                handleModal={(isCashOn && !isOnlinePay) ? cashOnDeliveryHandler : onPayment}
                deliveryAddress={deliveryAddress?.fullName ? false : true}
            />

            <Modal
                isVisible={showModal}
                backdropColor="black"
            >
                <View style={{ flex: 1, justifyContent: 'center' }}>
                    <SuccessFullMessage title={orderStatus} orderId={orderId} handleModal={handleModal} />
                </View>
            </Modal >

            <Modal
                isVisible={isWebView}
                backdropColor="black">
                <View style={{ flex: 1 }}>
                    {/* <TouchableOpacity
                    onPress={() => handleModal()}
                    style={{ width: '100%', height: 40, backgroundColor: 'red', }}>

                </TouchableOpacity> */}
                    <WebView
                        ref={(ref) => (webview = ref)}
                        source={{ uri: `${onlinePaymentUrl}` }}
                        renderError={(err) => console.log('web view', err)}
                        onNavigationStateChange={(stat) => {
                            const { url } = stat;
                            if (url.includes('checkout?status=fail')) {
                                webview.stopLoading();
                                setOrderStatus('Fail');
                                setIsWebView(false);
                                setShowModal(true)
                            }
                            if (url.includes('/checkout?status=cancel')) {
                                webview.stopLoading();
                                setOrderStatus('Cancel');
                                setIsWebView(false);
                                setShowModal(true)
                            }
                            if (url.includes('order-done?orderId')) {
                                webview.stopLoading();
                                setOrderStatus('Success');
                                let urlSplit = url.split('=');
                                let orderID = urlSplit.pop();
                                setOrderId(orderID)
                                setIsWebView(false);
                                setShowModal(true)
                                console.log('order done');
                            }
                        }}
                    />
                </View>
            </Modal>

        </View >
    );
};

export default PaymentMethodPage;