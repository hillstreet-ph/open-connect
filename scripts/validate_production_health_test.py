#!/usr/bin/env python3
import unittest

from validate_production_health import validate_health


def healthy_payload():
    return {
        "status": "ok",
        "model_upstream": "openrouter",
        "model_upstreams": ["openrouter"],
        "kv": {"bound": True, "writable": True},
        "databricks": {"configured": True},
        "env": {
            "SUPABASE_URL": True,
            "SUPABASE_PUBLISHABLE_KEY": True,
            "SUPABASE_SERVICE_ROLE_KEY": True,
        },
    }


class ProductionHealthContractTests(unittest.TestCase):
    def test_accepts_complete_health_envelope(self):
        self.assertEqual(validate_health(healthy_payload()), [])

    def test_rejects_current_false_positive_shape(self):
        payload = healthy_payload()
        payload["model_upstream"] = None
        payload["model_upstreams"] = []
        payload["databricks"] = {"configured": False}

        failures = validate_health(payload)

        self.assertIn("model_upstream must be configured", failures)
        self.assertIn("model_upstreams must contain at least one provider", failures)
        self.assertIn("Databricks must be configured", failures)

    def test_requires_writable_kv_and_supabase_bindings(self):
        payload = healthy_payload()
        payload["kv"] = {"bound": True, "writable": False}
        payload["env"]["SUPABASE_SERVICE_ROLE_KEY"] = False

        failures = validate_health(payload)

        self.assertIn("OC_KV must be bound and writable", failures)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY must be configured", failures)


if __name__ == "__main__":
    unittest.main()
