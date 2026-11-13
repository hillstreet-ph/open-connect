#!/usr/bin/env python3
import unittest

from validate_production_health import validate_health


def healthy_payload():
    return {
        "status": "ok",
        "model_upstream": "openrouter",
        "model_upstreams": ["openrouter"],
        "model_gateway": {"user_connections_supported": True},
        "kv": {"bound": True, "writable": True},
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
        payload["model_gateway"] = {"user_connections_supported": False}
        payload["databricks"] = {"configured": False}

        failures = validate_health(payload)

        self.assertIn(
            "model gateway must have a platform provider or support user-scoped connections",
            failures,
        )
        self.assertNotIn("Databricks must be configured", failures)

    def test_user_scoped_model_connections_do_not_require_platform_keys(self):
        payload = healthy_payload()
        payload["model_upstream"] = None
        payload["model_upstreams"] = []
        payload["model_gateway"] = {"user_connections_supported": True}

        self.assertEqual(validate_health(payload), [])

    def test_databricks_is_optional(self):
        payload = healthy_payload()
        payload["databricks"] = {"configured": False}

        self.assertEqual(validate_health(payload), [])

    def test_requires_writable_kv_and_supabase_bindings(self):
        payload = healthy_payload()
        payload["kv"] = {"bound": True, "writable": False}
        payload["env"]["SUPABASE_SERVICE_ROLE_KEY"] = False

        failures = validate_health(payload)

        self.assertIn("OC_KV must be bound and writable", failures)
        self.assertIn("SUPABASE_SERVICE_ROLE_KEY must be configured", failures)


if __name__ == "__main__":
    unittest.main()
