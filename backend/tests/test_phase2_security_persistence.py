import unittest
from unittest.mock import patch

from auth import CurrentUser, require_job_access
from db import repo


class Phase2OwnershipTests(unittest.TestCase):
    def setUp(self):
        self.user_a = CurrentUser("user-a", "a@example.test", ["firm-a"])
        self.user_b = CurrentUser("user-b", "b@example.test", ["firm-b"])

    def test_owner_can_access_session_backed_job(self):
        job = {"db_session_id": "session-a", "user_id": "user-a", "firm_id": "firm-a"}
        with patch.object(repo, "session_belongs_to_user", return_value=True):
            self.assertIs(require_job_access(job, self.user_a), job)

    def test_other_user_cannot_access_session_backed_job(self):
        job = {"db_session_id": "session-a", "user_id": "user-a", "firm_id": "firm-a"}
        with patch.object(repo, "session_belongs_to_user", return_value=False):
            with self.assertRaisesRegex(Exception, "العملية دي مش موجودة"):
                require_job_access(job, self.user_b)

    def test_owner_can_access_degraded_job_without_session(self):
        job = {"db_session_id": None, "user_id": "user-a", "firm_id": "firm-a"}
        self.assertIs(require_job_access(job, self.user_a), job)

    def test_other_user_cannot_access_degraded_job_without_session(self):
        job = {"db_session_id": None, "user_id": "user-a", "firm_id": "firm-a"}
        with self.assertRaisesRegex(Exception, "العملية دي مش موجودة"):
            require_job_access(job, self.user_b)


class ContractPersistenceTests(unittest.TestCase):
    def test_full_contract_artifact_is_sent_to_storage(self):
        captured = {}

        def insert(table, row, **kwargs):
            captured.update(table=table, row=row, kwargs=kwargs)
            return row

        with patch.object(repo.client, "insert", side_effect=insert):
            repo.save_contract_result(
                "session-a",
                [{"index": 1, "title": "البند", "body": "نص"}],
                "عقد عمل",
                preamble="مقدمة X",
                closing="خاتمة Z",
                contract_text="مقدمة X\n\nالبند 1\n\nخاتمة Z",
                contract_type_key="employment",
                clause_validation={"is_complete": True},
            )

        self.assertEqual(captured["table"], "contract_results")
        self.assertEqual(captured["row"]["preamble"], "مقدمة X")
        self.assertEqual(captured["row"]["closing"], "خاتمة Z")
        self.assertEqual(captured["row"]["contract_type_key"], "employment")
        self.assertTrue(captured["row"]["clause_validation"]["is_complete"])

    def test_legacy_save_call_remains_compatible(self):
        captured = {}

        def insert(table, row, **kwargs):
            captured.update(table=table, row=row, kwargs=kwargs)
            return row

        with patch.object(repo.client, "insert", side_effect=insert):
            repo.save_contract_result("session-old", [{"index": 1}], "عقد قديم")

        self.assertEqual(captured["row"]["clauses"], [{"index": 1}])
        self.assertNotIn("preamble", captured["row"])
        self.assertNotIn("closing", captured["row"])


if __name__ == "__main__":
    unittest.main()
