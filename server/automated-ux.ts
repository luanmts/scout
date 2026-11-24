export type AutomatedUxControl = {
  selector: string;
  tag: string;
  name: string;
  width: number;
  height: number;
  fontSize: number;
};

export type AutomatedUxSnapshot = {
  viewportWidth: number;
  scrollWidth: number;
  clientWidth: number;
  viewportMeta: string;
  headings: Array<{ tag: string; selector: string; text: string }>;
  controls: AutomatedUxControl[];
  ctaCount: number;
};

export type AutomatedUxFinding = {
  id: string;
  category: "accessibility" | "mobile" | "content";
  severity: "high" | "medium" | "low";
  selector: string;
  property: string;
  observedValue: string;
  rule: string;
  evidence: string;
  suggestion: string;
  verificationStatus: "verified";
};

export type AutomatedUxResult = {
  method: "automated";
  status: "completed" | "failed" | "not_run";
  findings: AutomatedUxFinding[];
  checks: { total: number; passed: number; failed: number };
  error?: string;
};

function finding(input: Omit<AutomatedUxFinding, "id" | "verificationStatus">): AutomatedUxFinding {
  return { ...input, id: `automated:${input.category}:${input.property}:${input.selector}`, verificationStatus: "verified" };
}

/** Pure, deterministic UX rules. It never calls a provider and never infers aesthetics. */
export function analyzeAutomatedUx(desktop: AutomatedUxSnapshot, mobile: AutomatedUxSnapshot): AutomatedUxResult {
  const findings: AutomatedUxFinding[] = [];
  const snapshots = [{ name: "desktop", value: desktop }, { name: "mobile", value: mobile }];
  let checks = 0;
  for (const snapshot of snapshots) {
    checks += 1;
    if (snapshot.value.scrollWidth > snapshot.value.clientWidth + 2) {
      findings.push(finding({
        category: "mobile",
        severity: "medium",
        selector: "document.documentElement",
        property: `${snapshot.name}.scrollWidth`,
        observedValue: `${snapshot.value.scrollWidth}px > ${snapshot.value.clientWidth}px`,
        rule: "scrollWidth must not exceed clientWidth by more than 2px.",
        evidence: `${snapshot.name} viewport overflow: document width ${snapshot.value.scrollWidth}px exceeds viewport ${snapshot.value.clientWidth}px.`,
        suggestion: "Find the overflowing element and constrain its width without hiding content.",
      }));
    }
    checks += 1;
    if (!snapshot.value.viewportMeta) {
      findings.push(finding({
        category: "mobile",
        severity: "high",
        selector: "head meta[name=viewport]",
        property: "content",
        observedValue: "missing",
        rule: "A responsive page must declare a viewport meta tag.",
        evidence: `${snapshot.name} DOM has no viewport meta tag.`,
        suggestion: "Add a responsive viewport meta tag.",
      }));
    }
  }

  checks += 1;
  if (!desktop.headings.some((heading) => heading.tag === "h1")) {
    findings.push(finding({
      category: "accessibility",
      severity: "medium",
      selector: "h1",
      property: "heading hierarchy",
      observedValue: "0 h1 elements",
      rule: "The inspected homepage should expose one primary h1 heading.",
      evidence: "No h1 element was found in the inspected homepage DOM.",
      suggestion: "Add one descriptive primary heading and preserve semantic heading order.",
    }));
  }

  const headingLevels = desktop.headings.map((heading) => Number(heading.tag.slice(1))).filter(Number.isFinite);
  checks += 1;
  for (let index = 1; index < headingLevels.length; index += 1) {
    if (headingLevels[index] - headingLevels[index - 1] > 1) {
      findings.push(finding({
        category: "accessibility",
        severity: "low",
        selector: desktop.headings[index].selector,
        property: "heading level",
        observedValue: `${desktop.headings[index - 1].tag} → ${desktop.headings[index].tag}`,
        rule: "Heading levels should not skip more than one level.",
        evidence: `Heading ${desktop.headings[index].selector} jumps from ${desktop.headings[index - 1].tag} to ${desktop.headings[index].tag}.`,
        suggestion: "Use sequential heading levels to preserve document structure.",
      }));
      break;
    }
  }

  const unnamed = [...desktop.controls, ...mobile.controls].filter((control) => !control.name).slice(0, 10);
  checks += 1;
  for (const control of unnamed) {
    findings.push(finding({
      category: "accessibility",
      severity: "medium",
      selector: control.selector,
      property: "accessible name",
      observedValue: "empty",
      rule: "Interactive controls must expose a non-empty accessible name.",
      evidence: `${control.tag} ${control.selector} has no text, label, placeholder, or aria-label.`,
      suggestion: "Give the control a visible label or an appropriate accessible name.",
    }));
  }

  const undersized = [...desktop.controls, ...mobile.controls].filter((control) => control.width > 0 && control.height > 0 && (control.width < 44 || control.height < 44)).slice(0, 10);
  checks += 1;
  for (const control of undersized) {
    findings.push(finding({
      category: "accessibility",
      severity: "low",
      selector: control.selector,
      property: "interactive target size",
      observedValue: `${Math.round(control.width)}x${Math.round(control.height)}px`,
      rule: "Interactive targets should be at least 44x44px in the inspected viewport.",
      evidence: `${control.tag} ${control.selector} rendered at ${Math.round(control.width)}x${Math.round(control.height)}px.`,
      suggestion: "Increase the hit area or provide sufficient spacing around the control.",
    }));
  }

  const tinyText = [...desktop.controls, ...mobile.controls].filter((control) => control.fontSize > 0 && control.fontSize < 12).slice(0, 10);
  checks += 1;
  for (const control of tinyText) {
    findings.push(finding({
      category: "accessibility",
      severity: "low",
      selector: control.selector,
      property: "font-size",
      observedValue: `${control.fontSize}px`,
      rule: "Interactive text should not be smaller than 12px without a justified exception.",
      evidence: `${control.tag} ${control.selector} uses ${control.fontSize}px text.`,
      suggestion: "Use a readable text size for interactive content.",
    }));
  }

  checks += 1;
  if (desktop.ctaCount === 0) {
    findings.push(finding({
      category: "content",
      severity: "low",
      selector: "a, button",
      property: "action affordance",
      observedValue: "0 recognized CTA elements",
      rule: "A homepage should expose at least one recognizable contact, booking, quote, or action affordance.",
      evidence: "No contact, quote, booking, schedule, call, start, order, or shop action was found in the inspected DOM.",
      suggestion: "Add a clear primary action appropriate to the business.",
    }));
  }

  return { method: "automated", status: "completed", findings, checks: { total: checks, passed: checks - findings.length, failed: findings.length } };
}
