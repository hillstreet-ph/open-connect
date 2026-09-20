"""Exercise real git history updates against an isolated local bare remote."""
import pathlib
import subprocess
import tempfile
import unittest

HELPER = pathlib.Path(__file__).with_name("update-marketplace-branch.sh").resolve()
BRANCH = "automation/marketplace-catalog-sync"
CATALOG = "config/marketplace-candidates.generated.json"


class CatalogBranchTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.tmp.name)
        self.remote = self.root / "remote.git"
        self.repo = self.root / "repo"
        self.run_git(self.root, "init", "--bare", str(self.remote))
        self.run_git(self.root, "clone", str(self.remote), str(self.repo))
        self.run_git(self.repo, "config", "user.name", "Fixture")
        self.run_git(self.repo, "config", "user.email", "fixture@example.invalid")
        self.run_git(self.repo, "switch", "-c", "main")
        (self.repo / "config").mkdir()
        (self.repo / CATALOG).write_text('{"generation":0}\n')
        (self.repo / "README.md").write_text("base\n")
        self.run_git(self.repo, "add", ".")
        self.run_git(self.repo, "commit", "-m", "base")
        self.run_git(self.repo, "push", "origin", "main")

    def tearDown(self):
        self.tmp.cleanup()

    def run_git(self, cwd, *args):
        return subprocess.check_output(["git", *args], cwd=cwd, stderr=subprocess.DEVNULL, text=True).strip()

    def update(self, generation):
        (self.repo / CATALOG).write_text('{"generation":' + str(generation) + '}\n')
        return subprocess.run(["bash", str(HELPER)], cwd=self.repo, capture_output=True, text=True)

    def test_repeated_updates_preserve_published_commits_and_main(self):
        self.assertEqual(self.update(1).returncode, 0)
        first = self.run_git(self.repo, "rev-parse", "HEAD")
        (self.repo / "review.txt").write_text("human review context\n")
        self.run_git(self.repo, "add", "review.txt")
        self.run_git(self.repo, "commit", "-m", "review")
        reviewed = self.run_git(self.repo, "rev-parse", "HEAD")
        self.run_git(self.repo, "push", "origin", BRANCH)
        self.run_git(self.repo, "switch", "main")
        (self.repo / "README.md").write_text("new base\n")
        self.run_git(self.repo, "commit", "-am", "advance main")
        base = self.run_git(self.repo, "rev-parse", "HEAD")
        self.run_git(self.repo, "push", "origin", "main")
        result = self.update(2)
        self.assertEqual(result.returncode, 0, result.stderr)
        for ancestor in (first, reviewed, base):
            self.run_git(self.repo, "merge-base", "--is-ancestor", ancestor, "HEAD")
        self.assertEqual((self.repo / "review.txt").read_text(), "human review context\n")
        self.assertIn('2', (self.repo / CATALOG).read_text())
        self.assertEqual(self.run_git(self.repo, "rev-parse", "HEAD"), self.run_git(self.repo, "rev-parse", "origin/" + BRANCH))

    def test_unrelated_changes_stop_before_push(self):
        (self.repo / "README.md").write_text("uncommitted edit\n")
        self.assertNotEqual(self.update(1).returncode, 0)
        self.assertEqual(self.run_git(self.repo, "ls-remote", "--heads", "origin", BRANCH), "")

    def test_catalog_merge_conflict_preserves_remote(self):
        self.assertEqual(self.update(1).returncode, 0)
        published = self.run_git(self.repo, "rev-parse", "HEAD")
        self.run_git(self.repo, "switch", "main")
        (self.repo / CATALOG).write_text('{"generation":99}\n')
        self.run_git(self.repo, "commit", "-am", "separate approved catalog edit")
        self.run_git(self.repo, "push", "origin", "main")
        self.assertNotEqual(self.update(2).returncode, 0)
        remote = self.run_git(self.repo, "ls-remote", "--heads", "origin", BRANCH)
        self.assertEqual(remote.split()[0], published)


if __name__ == "__main__":
    unittest.main()
