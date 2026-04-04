# PROVISION VALIDATION CHECKLIST

## Scope
Validation for provisioning layer:
- createSalonCanonical
- createMasterCanonical
- bindMasterToSalonCanonical
- activateMasterSalonCanonical
- terminateMasterSalonCanonical
- internal/provision.js registration

## 1. Static validation

### Node syntax check
Run:

```bat
cd /d C:\Work\totem-p0-api
node --check src\services\provision\provisionShared.js
node --check src\services\provision\createSalonCanonical.js
node --check src\services\provision\createMasterCanonical.js
node --check src\services\provision\bindMasterToSalonCanonical.js
node --check src\services\provision\activateMasterSalonCanonical.js
node --check src\services\provision\terminateMasterSalonCanonical.js
node --check src\routes\internal\provision.js
node --check src\routes\internal.js
```

Expected:
- no syntax errors

---

## 2. Route wiring validation

### Check route registration
```bat
type C:\Work\totem-p0-api\src\routes\internal.js | findstr /i provision
```

Expected lines:
- import buildProvisionRouter from "./internal/provision.js";
- const provisionRouter = buildProvisionRouter(pool);
- r.use(provisionRouter);

---

## 3. Server boot validation

```bat
cd /d C:\Work\totem-p0-api
npm run dev
```

Expected:
- server starts
- no import error
- no router crash
- no ESM export/default error

---

## 4. Endpoint surface validation

### Create salon
```bat
curl -X POST http://localhost:8080/internal/provision/salons ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"email\":\"salon.test@example.com\",\"name\":\"Owner Test\",\"salon_name\":\"Salon Test\",\"requested_role\":\"salon_admin\"}"
```

Expected:
- ok=true
- flow=create_salon
- result.salon.slug exists
- result.user.role=salon_admin

### Create master
```bat
curl -X POST http://localhost:8080/internal/provision/masters ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"email\":\"master.test@example.com\",\"name\":\"Master Test\",\"requested_role\":\"master\",\"password_hash\":\"test_hash\"}"
```

Expected:
- ok=true
- flow=create_master
- result.master.slug exists
- result.user.role=master

### Bind
```bat
curl -X POST http://localhost:8080/internal/provision/bind ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\",\"bind_mode\":\"pending\",\"create_contract\":false}"
```

Expected:
- ok=true
- flow=bind_master_to_salon
- result.relation.status=pending or active

### Activate
```bat
curl -X POST http://localhost:8080/internal/provision/bind/activate ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\"}"
```

Expected:
- ok=true
- flow=activate_master_salon
- result.relation.status=active

### Terminate
```bat
curl -X POST http://localhost:8080/internal/provision/bind/terminate ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer <TOKEN>" ^
  -d "{\"salon_slug\":\"<SALON_SLUG>\",\"master_slug\":\"<MASTER_SLUG>\"}"
```

Expected:
- ok=true
- flow=terminate_master_salon
- result.relation.status=fired

---

## 5. DB validation after create salon

Run:
```sql
SELECT id,email,role,salon_slug,salon_id
FROM public.auth_users
WHERE email='salon.test@example.com' AND role='salon_admin';

SELECT id,slug,name
FROM public.salons
WHERE slug='<SALON_SLUG>';

SELECT id,owner_id,salon_id,status
FROM public.owner_salon
WHERE salon_id=<SALON_ID>;

SELECT user_id,default_salon_slug
FROM public.user_default_salon
WHERE user_id=<USER_ID>;
```

Expected:
- all rows exist
- slugs match
- owner_salon status=active

---

## 6. DB validation after create master

```sql
SELECT id,email,role,master_slug,master_id
FROM public.auth_users
WHERE email='master.test@example.com' AND role='master';

SELECT id,slug,name,user_id
FROM public.masters
WHERE slug='<MASTER_SLUG>';
```

Expected:
- both rows exist
- masters.user_id matches auth_users.id

---

## 7. DB validation after bind

```sql
SELECT id,master_id,salon_id,status,invited_at,activated_at,fired_at
FROM public.master_salon
WHERE master_id=<MASTER_ID> AND salon_id=<SALON_ID>;
```

Expected:
- row exists
- status matches operation

Optional contract check:
```sql
SELECT id,salon_id,master_id,status,version,effective_from,archived_at
FROM public.contracts
WHERE salon_id='<SALON_ID>' AND master_id='<MASTER_ID>'
ORDER BY created_at DESC;
```

---

## 8. Identity snapshot validation

After create/bind, hit existing internal endpoints with the created identity.

Expected:
- salon owner can open /internal/salons/<slug>
- master can open /internal/masters/<slug>
- resolveAuth identity contains ownership/master relations

---

## 9. Non-regression rules

Must still work:
- existing public booking flow
- existing internal salon routes
- existing internal master routes
- finance routes
- contracts routes

Must not change:
- billing gating
- public routing contract
- finance pipeline

---

## 10. PASS criteria

Provisioning block is PASS only when:
1. syntax checks pass
2. server boots
3. all five endpoints respond
4. DB rows are created/updated correctly
5. resolveAuth sees new entities
6. no regression in public/runtime flows
