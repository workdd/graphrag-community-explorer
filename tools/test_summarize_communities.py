"""제공자를 부르지 않는 단위 테스트.

    python3 -m unittest discover -s tools -p 'test_summarize*' -q
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import summarize_communities as S


class TestMemberLines(unittest.TestCase):
    def test_lists_members_with_their_kind(self):
        rows, omitted = S.member_lines(["A", "B"], ["VM", "Disk"])
        self.assertEqual(rows, ["- A (VM)", "- B (Disk)"])
        self.assertEqual(omitted, 0)

    def test_cuts_a_large_community_and_says_how_many_were_left(self):
        rows, omitted = S.member_lines([str(i) for i in range(100)], ["K"] * 100, limit=10)
        self.assertEqual(len(rows), 10)
        self.assertEqual(omitted, 90)

    def test_handles_an_empty_community(self):
        self.assertEqual(S.member_lines([], []), ([], 0))


class TestBuildPrompt(unittest.TestCase):
    def test_states_the_real_member_count_even_when_the_list_is_cut(self):
        prompt = S.build_prompt("T", 1, [str(i) for i in range(50)], ["K"] * 50, [], limit=5)
        self.assertIn("members: 50", prompt)
        self.assertIn("and 45 more members not listed", prompt)

    def test_says_nothing_about_omissions_when_nothing_was_omitted(self):
        prompt = S.build_prompt("T", 0, ["A"], ["K"], [])
        self.assertNotIn("more members", prompt)

    def test_carries_the_level_and_the_relationship_types(self):
        prompt = S.build_prompt("T", 2, ["A"], ["K"], ["calls", "owns"])
        self.assertIn("level: 2", prompt)
        self.assertIn("- calls", prompt)

    def test_works_without_a_working_title(self):
        self.assertNotIn("working title", S.build_prompt("", 0, ["A"], ["K"], []))


class TestInternalLinkTypes(unittest.TestCase):
    def test_counts_only_links_with_both_ends_inside(self):
        out = S.internal_link_types(["A", "B"], ["A", "A"], ["B", "Outside"], ["calls", "owns"])
        self.assertEqual(out, ["calls (1)"])

    def test_orders_by_how_often_the_type_appears(self):
        out = S.internal_link_types(["A", "B", "C"],
                                    ["A", "B", "A"], ["B", "C", "C"], ["owns", "calls", "calls"])
        self.assertEqual(out, ["calls (2)", "owns (1)"])

    def test_returns_nothing_when_the_community_has_no_internal_link(self):
        self.assertEqual(S.internal_link_types(["A"], ["A"], ["B"], ["calls"]), [])

    def test_keeps_the_list_short(self):
        n = 40
        out = S.internal_link_types(["A", "B"], ["A"] * n, ["B"] * n, [f"t{i}" for i in range(n)], limit=5)
        self.assertEqual(len(out), 5)


class TestPromptHonesty(unittest.TestCase):
    def test_says_plainly_when_nothing_links_the_members(self):
        prompt = S.build_prompt("T", 0, ["A"], ["K"], [])
        self.assertIn("No relationship has both ends inside", prompt)

    def test_asks_for_a_language_when_one_was_chosen(self):
        self.assertIn("in Korean", S.build_prompt("T", 0, ["A"], ["K"], [], language="Korean"))

    def test_leaves_the_language_to_the_model_when_none_was_chosen(self):
        self.assertNotIn("Write the title and summary in", S.build_prompt("T", 0, ["A"], ["K"], []))


class TestParseReport(unittest.TestCase):
    def test_reads_a_well_formed_report(self):
        out = S.parse_report('{"title": "T", "summary": "S", "rank": 7, "rank_explanation": "why"}')
        self.assertEqual(out, {"title": "T", "summary": "S", "rank": 7.0, "rank_explanation": "why"})

    def test_reads_a_report_wrapped_in_a_fenced_block(self):
        out = S.parse_report('```json\n{"title": "T", "summary": "S", "rank": 1}\n```')
        self.assertEqual(out["summary"], "S")

    def test_returns_an_empty_summary_for_text_it_cannot_read(self):
        self.assertEqual(S.parse_report("sorry")["summary"], "")

    def test_clamps_a_rank_outside_the_range(self):
        self.assertEqual(S.parse_report('{"summary": "s", "rank": 99}')["rank"], 10.0)
        self.assertEqual(S.parse_report('{"summary": "s", "rank": -4}')["rank"], 0.0)

    def test_defaults_a_rank_that_is_not_a_number(self):
        self.assertEqual(S.parse_report('{"summary": "s", "rank": "high"}')["rank"], 0.0)

    def test_survives_a_json_value_that_is_not_an_object(self):
        self.assertEqual(S.parse_report("[1, 2]")["summary"], "")


class TestBackoff(unittest.TestCase):
    def test_retries_rate_limits_and_server_errors_only(self):
        self.assertTrue(S.should_retry(429))
        self.assertTrue(S.should_retry(500))
        self.assertFalse(S.should_retry(400))

    def test_honours_the_providers_retry_after(self):
        self.assertEqual(S.wait_for(0, "3"), 3.0)

    def test_grows_with_each_attempt(self):
        self.assertLess(S.wait_for(0), S.wait_for(2))


if __name__ == "__main__":
    unittest.main()
