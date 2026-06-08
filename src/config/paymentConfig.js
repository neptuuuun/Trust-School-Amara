export const PAYMENT_CONFIG = {
  ccp: {
    accountName: "Trust School Amara",
    accountNumber: "0000236141",
    key: "77",
  },
  baridiMob: {
    phone: "00799999000023614177",
  },
};

export const PAYMENT_METHODS = [
  {
    value: "CCP",
    label: "بريد الجزائر CCP",
    details: [
      { label: "الاسم", value: PAYMENT_CONFIG.ccp.accountName },
      { label: "رقم الحساب", value: PAYMENT_CONFIG.ccp.accountNumber },
      { label: "المفتاح", value: PAYMENT_CONFIG.ccp.key },
    ],
  },
  {
    value: "Baridimob",
    label: "بريدي موب BaridiMob",
    details: [
      { label: "رقم الهاتف", value: PAYMENT_CONFIG.baridiMob.phone },
    ],
  },
];
