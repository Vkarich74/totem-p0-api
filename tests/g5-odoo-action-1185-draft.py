# Isolated Python stub: source mapping and sequential idempotency only,
# NOT Odoo ORM/safe_eval/ACL/concurrent-transaction verification.
import unittest
from pathlib import Path
from types import SimpleNamespace as R
ACTION = compile((Path(__file__).resolve().parents[1]/"odoo/drafts/g5_action_1185_approved_us_profiles.py").read_text(encoding="utf-8"), "action1185_draft", "exec")
class UserError(Exception): pass
def rel(id): return R(id=id)
company=rel(4)
team=R(id=8,company_id=company)
stage=R(id=81,team_ids=[team])
class Model:
 def __init__(self,record=None): self.record=record;self.rows=[]
 def sudo(self):return self
 def browse(self,id):return self
 def exists(self):return self.record
 def with_company(self,*a):return self
 def with_context(self,**kw):return self
 def search(self,domain,limit):
  assert limit==2
  return self.rows[0] if len(self.rows)==1 else self.rows
 def create(self,v):
  self.rows.append(Row(**v))
class Row(R):
 def __len__(self):return 1
 def __init__(self,**v):
  super().__init__(**v)
  for k in ['x_totem_us_source_partner_id','partner_id']:setattr(self,k,rel(v[k]))
  self.active=True
def profile(mode):
 return R(id=20001,company_id=company,website_id=rel(5),active=True,x_totem_us_profile_status='approved',
   x_totem_us_account_kind='salon' if mode=='salon' else 'master',x_totem_us_master_entry_mode=mode,
   email='fixture@example.invalid',name='Fixture Owner',phone='+12125550123',street='100 Fixture St',city='New York',
   x_totem_us_business_name='Fixture Salon',x_totem_us_business_phone='+12125550123',
   x_totem_us_business_street='100 Fixture St',x_totem_us_business_city='New York',x_totem_us_business_zip='10001',
   x_totem_us_business_slug='fixture-salon',x_totem_us_business_state_id=R(id=33,code='NY',country_id=R(code='US')),
   x_totem_us_business_description='fixture',x_totem_us_master_salon_id=False,x_totem_us_master_slug='fixture-master',
   x_totem_us_master_specialty='Hair',x_totem_us_master_bio='fixture')
class TestAction(unittest.TestCase):
 def setUp(self):
  self.crm=Model()
  self.env={'res.company':Model(company),'crm.team':Model(team),'crm.stage':Model(stage),'crm.lead':self.crm}
 def run_action(self,p):exec(ACTION,{'records':[p],'env':self.env,'UserError':UserError})
 def test_salon(self):
  self.run_action(profile('salon'));r=self.crm.rows[0]
  self.assertEqual((r.x_totem_us_owner_type,r.stage_id,r.x_totem_us_slug_requested),('salon',81,'fixture-salon'))
 def test_own_salon_one_lead_and_retry(self):
  p=profile('own_salon');self.run_action(p);self.run_action(p)
  self.assertEqual(len(self.crm.rows),1);r=self.crm.rows[0]
  self.assertEqual((r.x_totem_us_owner_type,r.stage_id,r.x_totem_us_slug_requested,r.x_totem_us_salon_slug,r.x_totem_us_state_code),('master',81,'fixture-master','fixture-salon','NY'))
  self.assertEqual(r.x_totem_us_source_key,'odoo-us-partner-20001')
 def test_existing_salon_only_master_lead(self):
  p=profile('existing_salon');target=profile('salon');target.id=20002;target.x_totem_us_business_slug='target-salon';p.x_totem_us_master_salon_id=target
  self.run_action(p);r=self.crm.rows[0]
  self.assertEqual((r.x_totem_us_owner_type,r.x_totem_us_salon_slug,r.stage_id),('master','target-salon',81))
 def test_no_foreign_relation(self):
  p=profile('own_salon');p.x_totem_us_master_salon_id=rel(20002)
  with self.assertRaises(UserError):self.run_action(p)
  self.assertEqual(len(self.crm.rows),0)
 def test_no_unapproved_target(self):
  p=profile('existing_salon');target=profile('salon');target.id=20002;target.x_totem_us_profile_status='submitted';p.x_totem_us_master_salon_id=target
  with self.assertRaises(UserError):self.run_action(p)
  self.assertEqual(len(self.crm.rows),0)
 def test_duplicate_and_archived_fail_closed(self):
  p=profile('own_salon');self.run_action(p);r=self.crm.rows[0];r.active=False
  with self.assertRaises(UserError):self.run_action(p)
  self.crm.rows.append(r)
  with self.assertRaises(UserError):self.run_action(p)
  self.assertEqual(len(self.crm.rows),2)
 def test_foreign_scope_and_unapproved_ignored(self):
  p=profile('salon');p.company_id=rel(1);self.run_action(p);p.company_id=company;p.x_totem_us_profile_status='draft';self.run_action(p)
  self.assertEqual(len(self.crm.rows),0)
if __name__=='__main__':unittest.main()
