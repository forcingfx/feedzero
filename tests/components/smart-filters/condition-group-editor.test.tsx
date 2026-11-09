/**
 * The shared ConditionGroupEditor is used by both Smart Filters and
 * per-feed Rules. The group-level NOT toggle was removed in favor of
 * the per-condition `not-contains` / `not-in` operators — same
 * expressive power, simpler mental model. The data field `not?` on
 * ConditionGroup stays on the type so vaults written by older clients
 * keep evaluating correctly; only the editor affordance is gone.
 */
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConditionGroupEditor } from "@/components/smart-filters/condition-group-editor.tsx";
import type { ConditionGroup } from "@feedzero/core/types";

function emptyGroup(): ConditionGroup {
  return { kind: "group", match: "all", children: [] };
}

describe("ConditionGroupEditor", () => {
  it("does not render the group-level NOT toggle", () => {
    render(
      <ConditionGroupEditor group={emptyGroup()} onChange={() => {}} />,
    );
    expect(screen.queryByLabelText("Negate this group")).toBeNull();
    // The "NOT" text label that lived next to the switch is also gone.
    expect(screen.queryByText("NOT")).toBeNull();
  });

  it("still renders the Match all/any selector", () => {
    render(
      <ConditionGroupEditor group={emptyGroup()} onChange={() => {}} />,
    );
    expect(screen.getByLabelText("Match mode")).toBeInTheDocument();
  });

  it("offers a Link field so a rule can mute YouTube Shorts by URL (issue #343)", async () => {
    function Harness() {
      const [group, setGroup] = useState<ConditionGroup>({
        kind: "group",
        match: "all",
        children: [{ kind: "title", op: "contains", value: "" }],
      });
      return <ConditionGroupEditor group={group} onChange={setGroup} />;
    }
    render(<Harness />);

    await userEvent.selectOptions(screen.getByLabelText("Field"), "link");
    await userEvent.type(screen.getByLabelText("Value"), "/shorts/");

    expect(screen.getByLabelText("Field")).toHaveValue("link");
    expect(screen.getByLabelText("Operator")).toHaveValue("contains");
    expect(screen.getByLabelText("Value")).toHaveValue("/shorts/");
  });
});
