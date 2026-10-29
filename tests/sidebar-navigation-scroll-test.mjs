import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const app=readFileSync(new URL("../src/App.jsx",import.meta.url),"utf8");
const main=app.slice(app.indexOf("function MainLayout("));
const helperStart=main.indexOf("const renderSidebarContent = () => (");
const helperEnd=main.indexOf("\n  return (",helperStart);
assert.ok(helperStart>=0 && helperEnd>helperStart,"Sidebar must use a render helper");
const helper=main.slice(helperStart,helperEnd);
assert.equal(main.split("{renderSidebarContent()}").length-1,2,"Both desktop and mobile use the same render helper");
assert.ok(!main.includes("<SidebarContent"),"Nested React component would remount on menu change");
assert.ok(helper.includes('className="bhs-luxury-nav custom-scrollbar"'),"Keep original scrolling container");
assert.ok(helper.includes('aria-current={activeMenu === m.id ? "page" : undefined}'),"Active highlight must update");
assert.ok(helper.includes('onClick={() => { setActiveMenu(m.id); setIsMobileMenuOpen(false); }}'),"Menu navigation unchanged");
assert.ok(!/\buse(?:State|Effect|Ref|Memo|Callback|LayoutEffect)\s*\(/.test(helper),"Render helper must not call hooks");
assert.ok(main.includes('className="bhs-luxury-sidebar hidden md:flex flex-col w-[278px] shrink-0 z-20"'),"Desktop sidebar remains");
assert.ok(main.includes('className="bhs-luxury-sidebar relative w-72 max-w-[85%] h-full z-50 flex flex-col"'),"Mobile drawer remains");
console.log("Sidebar scroll position retention: regression checks passed");
