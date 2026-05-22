"""Custom HTML test report generator using dominate."""

import collections
import datetime as dt
import inspect
from pathlib import Path
from dominate import document
from dominate.tags import (
    h1, h2, table, thead, tbody, tr, th, td,
    span, div, p, style, script
)


def generate_grouped_html_report(session, exitstatus):
    """
    Generate a custom HTML report grouped by test class.
    
    This function extracts all test results from session.config._custom_reports,
    groups them by class, renders class and method docstrings, and writes a
    styled HTML file (report_grouped.html) with:
    - Summary cards (total, passed, failed, skipped)
    - Per-class blocks with docstring summaries
    - Per-test rows with descriptions and expandable logs
    """
    all_reports = getattr(session.config, "_custom_reports", [])

    # Group reports by class name
    grouped = collections.defaultdict(list)
    for report in all_reports:
        parts = report.nodeid.split("::")
        class_name = parts[1] if len(parts) >= 3 else "General"
        grouped[class_name].append(report)

    # Collect class docstrings
    class_docs = {}
    for item in session.items:
        parts = item.nodeid.split("::")
        if len(parts) >= 3:
            cls = parts[1]
            if cls not in class_docs:
                try:
                    class_docs[cls] = inspect.getdoc(item.cls) or ""
                except Exception:
                    class_docs[cls] = ""

    # Calculate summary counts
    call_reports = [r for r in all_reports if r.when == "call"]
    total   = len(call_reports)
    passed  = sum(1 for r in call_reports if r.outcome == "passed")
    failed  = sum(1 for r in call_reports if r.outcome == "failed")
    skipped = sum(1 for r in call_reports if r.outcome == "skipped")

    # Create document with styling
    doc = document(title="Alert Config Test Report")
    with doc.head:
        style(_get_stylesheet())

    with doc:
        # Header section
        with div(cls="header"):
            h1("Alert Config — Test Report")
            with div(cls="meta"):
                p(f"Generated: {dt.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                p(f"Classes: {len(grouped)}")

        # Summary cards
        with div(cls="summary"):
            with div(cls="summary-card"):
                div(str(total),   cls="num num-total");  div("Total",   cls="lbl")
            with div(cls="summary-card"):
                div(str(passed),  cls="num num-passed"); div("Passed",  cls="lbl")
            with div(cls="summary-card"):
                div(str(failed),  cls="num num-failed"); div("Failed",  cls="lbl")
            with div(cls="summary-card"):
                div(str(skipped), cls="num num-skipped");div("Skipped", cls="lbl")

        # Class-grouped test results
        with div(cls="container"):
            for class_name, reports in grouped.items():
                c_calls   = [r for r in reports if r.when == "call"]
                c_passed  = sum(1 for r in c_calls if r.outcome == "passed")
                c_failed  = sum(1 for r in c_calls if r.outcome == "failed")

                with div(cls="class-block"):
                    with div(cls="class-header"):
                        h2(class_name)
                        cdoc = class_docs.get(class_name, "")
                        if cdoc:
                            div(cdoc.split("\n")[0], cls="class-doc")
                        with div(cls="class-stats"):
                            span(f"✓ {c_passed} passed", cls="badge passed")
                            if c_failed:
                                span(f"✗ {c_failed} failed", cls="badge failed")

                    # Test results table
                    with table():
                        with thead():
                            with tr():
                                th("Result",      style="width:100px")
                                th("Test / Description")
                                th("Duration",    style="width:90px")
                        with tbody():
                            for idx, r in enumerate(c_calls):
                                test_name = r.nodeid.split("::")[-1]
                                desc = getattr(r, "description", "") or ""
                                dur  = f"{r.duration:.2f}s" if hasattr(r, "duration") else ""

                                # Extract log sections
                                stdout_setup = stdout_call = stderr_call = log_call = traceback_log = ""
                                if hasattr(r, "sections"):
                                    for title, content in r.sections:
                                        if "stdout" in title and "setup" in title:
                                            stdout_setup = content
                                        elif "stdout" in title and "call" in title:
                                            stdout_call = content
                                        elif "stderr" in title:
                                            stderr_call = content
                                        elif "log" in title:
                                            log_call = content
                                if r.outcome == "failed" and r.longrepr:
                                    try:
                                        traceback_log = str(r.longrepr)
                                    except Exception:
                                        traceback_log = ""

                                has_logs = any([stdout_setup, stdout_call, stderr_call, log_call, traceback_log])
                                drawer_id = f"d-{class_name}-{idx}".replace(" ", "-")

                                # Render test row
                                with tr():
                                    td(span(r.outcome.upper(), cls=f"badge {r.outcome}"))
                                    with td():
                                        div(test_name, cls="test-name")
                                        if desc:
                                            div(desc, cls="test-desc")
                                        if has_logs:
                                            div("▶ show logs", cls="expand-btn",
                                                onclick=f"toggleDrawer('{drawer_id}')",
                                                id=f"btn-{drawer_id}")
                                            with div(cls="drawer", id=drawer_id):
                                                if traceback_log:
                                                    with div(cls="log-section"):
                                                        div("Traceback", cls="log-label")
                                                        div(traceback_log, cls="log-box log-error")
                                                if stdout_call:
                                                    with div(cls="log-section"):
                                                        div("stdout", cls="log-label")
                                                        div(stdout_call, cls="log-box")
                                                if stderr_call:
                                                    with div(cls="log-section"):
                                                        div("stderr", cls="log-label")
                                                        div(stderr_call, cls="log-box")
                                                if log_call:
                                                    with div(cls="log-section"):
                                                        div("captured log", cls="log-label")
                                                        div(log_call, cls="log-box")
                                                if stdout_setup:
                                                    with div(cls="log-section"):
                                                        div("setup output", cls="log-label")
                                                        div(stdout_setup, cls="log-box")
                                    td(dur, cls="dur")

        # JavaScript for expandable logs
        script("""
            function toggleDrawer(id) {
                const drawer = document.getElementById(id);
                const btn = document.getElementById('btn-' + id);
                const isOpen = drawer.classList.contains('open');
                drawer.classList.toggle('open');
                btn.textContent = isOpen ? '▶ show logs' : '▼ hide logs';
            }
        """)

    # Generate dynamic report name
    test_file = session.items[0].location[0]
    module_name = Path(test_file).stem

    timestamp = dt.datetime.now().strftime("%Y%m%d_%H%M%S")

    reports_dir = Path("reports")
    reports_dir.mkdir(exist_ok=True)

    report_filename = f"{module_name}_{timestamp}.html"
    report_path = reports_dir / report_filename

    # Write report
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(doc.render())

    print(f"\nHTML report generated: {report_path}")

def _get_stylesheet():
    """Return the complete CSS stylesheet for the report."""
    return """
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; color: #1e293b; }
        .header { background: #0f172a; padding: 24px 40px; display: flex; align-items: center; justify-content: space-between; }
        .header h1 { color: #f8fafc; font-size: 20px; font-weight: 600; }
        .header .meta { color: #64748b; font-size: 12px; text-align: right; line-height: 1.8; }
        .summary { display: flex; gap: 16px; padding: 20px 40px; background: #fff; border-bottom: 1px solid #e2e8f0; }
        .summary-card { flex: 1; background: #f8fafc; border-radius: 8px; padding: 14px 18px; border: 1px solid #e2e8f0; }
        .summary-card .num { font-size: 28px; font-weight: 700; }
        .summary-card .lbl { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px; }
        .num-total { color: #334155; } .num-passed { color: #16a34a; } .num-failed { color: #dc2626; } .num-skipped { color: #d97706; }
        .container { padding: 28px 40px; display: flex; flex-direction: column; gap: 20px; }
        .class-block { background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #e2e8f0; }
        .class-header { background: #1e293b; padding: 14px 20px; }
        .class-header h2 { color: #f1f5f9; font-size: 15px; font-weight: 600; }
        .class-doc { color: #94a3b8; font-size: 12px; margin-top: 5px; line-height: 1.6; }
        .class-stats { display: flex; gap: 8px; margin-top: 10px; }
        table { width: 100%; border-collapse: collapse; }
        thead tr { background: #f8fafc; border-bottom: 2px solid #e2e8f0; }
        th { color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; padding: 10px 16px; text-align: left; }
        td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 13px; }
        tbody tr:last-child td { border-bottom: none; }
        tbody tr:hover td { background: #fafafa; }
        .badge { display: inline-block; padding: 2px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; }
        .passed  { background: #dcfce7; color: #15803d; }
        .failed  { background: #fee2e2; color: #b91c1c; }
        .skipped { background: #fef3c7; color: #b45309; }
        .test-name { font-weight: 500; color: #1e293b; font-size: 13px; }
        .test-desc { color: #64748b; font-size: 12px; margin-top: 4px; line-height: 1.6; font-style: italic; }
        .dur { color: #94a3b8; font-size: 12px; white-space: nowrap; }
        .expand-btn { cursor: pointer; font-size: 11px; color: #3b82f6; background: none; border: none; padding: 0; margin-top: 8px; display: inline-block; }
        .expand-btn:hover { text-decoration: underline; }
        .drawer { display: none; margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 10px; }
        .drawer.open { display: block; }
        .log-section { margin-bottom: 10px; }
        .log-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 4px; }
        .log-box { background: #0f172a; color: #94a3b8; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; padding: 12px 14px; border-radius: 6px; white-space: pre-wrap; line-height: 1.7; max-height: 250px; overflow-y: auto; }
        .log-error { color: #fca5a5; }
    """
