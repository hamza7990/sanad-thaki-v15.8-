# تشغيل النسخة على AWS Staging

## 1) إنشاء EC2
- Ubuntu 22.04
- t3.medium كبداية
- افتح المنافذ: 22 و 80 و 443 فقط
- لا تفتح 5432

## 2) رفع النسخة
scp -i key.pem sanad-thaki-saas-security-fixes-v2.zip ubuntu@SERVER_IP:/home/ubuntu

## 3) التشغيل
unzip sanad-thaki-saas-security-fixes-v2.zip
cd sanad-thaki-saas-security-fixes-v2
chmod +x START-AWS-UBUNTU.sh
./START-AWS-UBUNTU.sh

## 4) الفحص
افتح:
http://SERVER_IP/health

## 5) قبل الإنتاج
- غيّر الأسرار.
- اربط دومين.
- فعل HTTPS.
- انقل DB إلى RDS private.
- فعل CloudWatch.
- نفذ اختبار اختراق خارجي.
