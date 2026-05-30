# دليل النسخ الاحتياطي والاستعادة — سند ذكي

## نسخ قاعدة التحكم

```bash
export DATABASE_URL='postgres://...control...'
export BACKUP_DIR=/secure/backups/sanad
bash ops/backup-control-db.sh
```

## نسخ قاعدة مستأجر واحد

```bash
export TENANT_ID='company-xxxx'
export TENANT_DATABASE_URL='postgres://...tenant...'
export BACKUP_DIR=/secure/backups/sanad
bash ops/backup-tenant-db.sh
```

## استعادة مستأجر إلى قاعدة جديدة فقط

```bash
export TARGET_DATABASE_URL='postgres://...new-empty-tenant-db...'
export BACKUP_FILE='/secure/backups/sanad/tenant-company-xxxx-20260529T000000Z.dump'
bash ops/restore-tenant-db-to-new-database.sh
```

## قاعدة السلامة

- لا تستعد فوق قاعدة إنتاج مباشرة.
- استعد إلى قاعدة جديدة، اختبر، ثم حدّث سر `db_url` للمستأجر في Secrets Manager بعد موافقة تغيير رسمية.
- احتفظ بملف `.sha256` مع كل نسخة احتياطية.
