import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAxureNotes, readAxurePages } from "./axure-pages.js";
import { fetchAxureScreens, isAxureUrl, noteToLines, pageDataPath } from "./fetch-screens.js";
import { htmlToLines } from "./html-text.js";
import { parseAxureData } from "./parse-axure-data.js";

const DOCUMENT_JS = `$axure.loadDocument(
(function() {
    var _ = function() { var r={},a=arguments; for(var i=0; i<a.length; i+=2) r[a[i]]=a[i+1]; return r; }
    var _creator = function() { return _(b,_(c,d),e,_(f,[_(g,h,i,j,k,l,m,n),_(g,o,i,p,k,q,m,o,r,[_(g,s,i,t,k,u,m,v,w,x)])]));};
var b="configuration",c="showPageNotes",d=true,e="sitemap",f="rootNodes",g="id",h="wordec",i="pageName",j="개정이력",k="type",l="Wireframe",m="url",n="개정이력.html",o="",p="공통",q="Folder",r="children",s="a1",t="[PI-001]환자정보",u="Wireframe",v="_pi-001_환자정보.html",w="stamp",x=new Date(1770267725567.4626);
return _creator();
})());`;

const PAGE_JS = `$axure.loadCurrentPage(
(function() {
    var _ = function() { var r={},a=arguments; for(var i=0; i<a.length; i+=2) r[a[i]]=a[i+1]; return r; }
    var _creator = function() { return _(b,_(c,d,e,[_(f,g,h,i,j,k,l,m),_(f,n,h,o,j,k,l,p),_(f,q,h,r,j,s,l,t)]));};
var b="page",c="name",d="[PI-001]환자정보",e="annotations",f="fn",g="1.1",h="ownerId",i="x1",j="label",k="(Rectangle)",l="Note",m="<p>1-1. 표시 항목</p><ul><li>생년월일 표시형식: YYYY-MM-DD</li></ul>",n="1",o="x2",p="<ul><li><span>환자 이름 클릭 시 [1.1] 팝오버 노출</span></li></ul>",q="2",r="x3",s="진행 이력 ",t="<p>(12/20 수정)</p><p>이력이 없으면 &quot;진행 이력이 없어요.&quot; 표시</p>";
return _creator();
})());`;

describe("parseAxureData", () => {
  it("변수 테이블과 _() 호출을 코드 실행 없이 값으로 읽는다", () => {
    const data = parseAxureData(DOCUMENT_JS);
    assert.deepEqual(Object.keys(data), ["configuration", "sitemap"]);
  });

  it("허용하지 않은 구문은 실행하지 않고 에러를 낸다", () => {
    const source = `var _creator = function() { return _(a,b);};\nvar a="k",b=process.exit(1);\nreturn _creator();`;
    assert.throws(() => parseAxureData(source));
  });
});

describe("readAxurePages", () => {
  it("폴더는 건너뛰고 페이지와 화면 ID 를 돌려준다", () => {
    const pages = readAxurePages(DOCUMENT_JS);
    assert.deepEqual(
      pages.map((page) => [page.pageName, page.url, page.screenId]),
      [
        ["개정이력", "개정이력.html", undefined],
        ["[PI-001]환자정보", "_pi-001_환자정보.html", "PI-001"],
      ],
    );
  });
});

describe("readAxureNotes", () => {
  it("번호순으로 정렬하고 HTML 을 줄로 푼다", () => {
    const notes = readAxureNotes(PAGE_JS);
    assert.deepEqual(
      notes.map((note) => note.no),
      ["1", "1.1", "2"],
    );
    assert.deepEqual(notes[2]?.lines, ["(12/20 수정)", '이력이 없으면 "진행 이력이 없어요." 표시']);
  });
});

describe("htmlToLines", () => {
  it("엔티티를 풀고 빈 줄을 버린다", () => {
    assert.deepEqual(htmlToLines("<p>A &gt; B</p><p> </p><p>C&nbsp;D</p>"), ["A > B", "C D"]);
  });
});

describe("noteToLines", () => {
  it("기본 라벨은 빼고 이름 붙인 라벨은 제목에 넣는다", () => {
    assert.deepEqual(noteToLines({ no: "1", label: "(Rectangle)", lines: ["가", "나"] }), ["[1] 가", "나"]);
    assert.deepEqual(noteToLines({ no: "2", label: "진행 이력", lines: ["다"] }), ["[2 진행 이력] 다"]);
  });
});

describe("isAxureUrl", () => {
  it("axshare.com 주소만 Axure 로 본다", () => {
    assert.equal(isAxureUrl("https://djje6x.axshare.com/?id=1&p=x"), true);
    assert.equal(isAxureUrl("https://www.figma.com/design/abc"), false);
    assert.equal(isAxureUrl("https://evilaxshare.com/"), false);
    assert.equal(isAxureUrl("not a url"), false);
  });
});

describe("pageDataPath", () => {
  it("url 에서 data.js 경로를 만든다", () => {
    assert.equal(
      pageDataPath({ pageName: "x", url: "_pi-001_환자정보.html", type: "Wireframe" }),
      `files/${encodeURIComponent("_pi-001_환자정보")}/data.js`,
    );
  });
});

describe("fetchAxureScreens", () => {
  it("화면 ID 가 있는 페이지만 ScreenSegment 로 만든다", async () => {
    const requested: string[] = [];
    const screens = await fetchAxureScreens({
      baseUrl: "https://abc.axshare.com/?id=1&p=x",
      fetchImpl: async (url) => {
        requested.push(url);
        const body = url.endsWith("/data/document.js") ? DOCUMENT_JS : PAGE_JS;
        return { status: 200, text: async () => body };
      },
    });
    assert.equal(screens.length, 1);
    assert.equal(screens[0]?.screenId, "PI-001");
    assert.equal(screens[0]?.source, "axure");
    assert.equal(screens[0]?.screenName, "PI-001 환자정보");
    assert.match(screens[0]?.body ?? "", /^\[1\] 환자 이름 클릭 시/u);
    assert.equal(requested[0], "https://abc.axshare.com/data/document.js");
  });

  it("페이지 주소를 넣으면 그 페이지만 읽는다", async () => {
    const requested: string[] = [];
    const fetchImpl = async (url: string) => {
      requested.push(url);
      return { status: 200, text: async () => (url.endsWith("/data/document.js") ? DOCUMENT_JS : PAGE_JS) };
    };
    const byPath = await fetchAxureScreens({
      baseUrl: `https://abc.axshare.com/${encodeURIComponent("_pi-001_환자정보")}.html`,
      fetchImpl,
    });
    const byViewer = await fetchAxureScreens({
      baseUrl: `https://abc.axshare.com/?id=1&p=${encodeURIComponent("_pi-001_환자정보")}&g=12`,
      fetchImpl,
    });
    assert.equal(byPath.length, 1);
    assert.equal(byViewer.length, 1);
    assert.equal(requested.filter((url) => url.includes("/files/")).length, 2);
  });

  it("공개되지 않은 게시본이면 안내 메시지를 낸다", async () => {
    await assert.rejects(
      fetchAxureScreens({
        baseUrl: "https://abc.axshare.com",
        fetchImpl: async () => ({ status: 403, text: async () => "" }),
      }),
      /공개 상태/u,
    );
  });
});
