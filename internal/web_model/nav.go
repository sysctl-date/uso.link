package web_model

import (
	"encoding/json"
	"html"
	"html/template"
	"os"
	"strings"

	"uso.link/internal/utils/log2"
)

// NavTool 单个工具入口
type NavTool struct {
	Path  string `json:"path"`
	Label string `json:"label"`
}

// NavCategory 一个导航分类
type NavCategory struct {
	Name  string    `json:"name"`
	Tools []NavTool `json:"tools"`
}

// 同类标签栏最多直接展示的数量,超出折叠进“更多工具”
const siblingVisible = 8

var (
	// NavData 导航数据源(来自 nav.json),是顶栏/页脚/同类标签的唯一数据来源
	NavData []NavCategory

	// 以下均为启动时预渲染并缓存的 HTML 片段,运行时直接注入,零再渲染开销
	NavbarHTML    template.HTML            // 顶部下拉菜单
	FooterNavHTML template.HTML            // 页脚“优速网推荐”分类网格
	SiblingTabs   map[string]template.HTML // 路径 -> 该页所属分类的同类标签栏(自身高亮)
)

// InitNav 加载导航数据并预生成 HTML 缓存
func InitNav(confPath string) error {
	buf, err := os.ReadFile(confPath)
	if log2.IfErrPrt(err) {
		return err
	}
	if err := json.Unmarshal(buf, &NavData); log2.IfErrPrt(err) {
		return err
	}
	buildNavCache()
	return nil
}

func buildNavCache() {
	NavbarHTML = template.HTML(renderNavbar())
	FooterNavHTML = template.HTML(renderFooterNav())
	SiblingTabs = renderSiblingTabs()
}

// 顶部导航下拉菜单
func renderNavbar() string {
	var b strings.Builder
	b.WriteString(`<ul class="nav navbar-nav" id="top_menu">`)
	for _, c := range NavData {
		b.WriteString(`<li class="dropdown"><a href="/" class="dropdown-toggle" data-toggle="dropdown" role="button" aria-haspopup="true" aria-expanded="false">`)
		b.WriteString(html.EscapeString(c.Name))
		b.WriteString(`<span class="caret"></span></a><ul class="dropdown-menu ul-list">`)
		for _, t := range c.Tools {
			b.WriteString(`<li><a href="`)
			b.WriteString(html.EscapeString(t.Path))
			b.WriteString(`">`)
			b.WriteString(html.EscapeString(t.Label))
			b.WriteString(`</a></li>`)
		}
		b.WriteString(`</ul></li>`)
	}
	b.WriteString(`</ul>`)
	return b.String()
}

// 页脚“优速网推荐”分类网格
func renderFooterNav() string {
	var b strings.Builder
	for _, c := range NavData {
		b.WriteString(`<ul class="list-inline list-inline-bg"><h3><span>`)
		b.WriteString(html.EscapeString(c.Name))
		b.WriteString(`</span></h3>`)
		for _, t := range c.Tools {
			b.WriteString(`<li><span></span><a href="`)
			b.WriteString(html.EscapeString(t.Path))
			b.WriteString(`">`)
			b.WriteString(html.EscapeString(t.Label))
			b.WriteString(`</a></li>`)
		}
		b.WriteString(`</ul>`)
	}
	return b.String()
}

// 为每个工具页预渲染其所属分类的同类标签栏(自身高亮)
func renderSiblingTabs() map[string]template.HTML {
	out := make(map[string]template.HTML)
	for _, c := range NavData {
		for _, active := range c.Tools {
			out[active.Path] = template.HTML(renderTabsFor(c.Tools, active.Path))
		}
	}
	return out
}

func renderTabsFor(tools []NavTool, activePath string) string {
	var b strings.Builder
	b.WriteString(`<ul class="nav nav-tabs hbflag">`)

	// 复制一份,必要时把激活项换进可见区,保证当前工具的标签始终可见
	ordered := make([]NavTool, len(tools))
	copy(ordered, tools)
	if len(ordered) > siblingVisible {
		activeIdx := -1
		for i, t := range ordered {
			if t.Path == activePath {
				activeIdx = i
				break
			}
		}
		if activeIdx >= siblingVisible {
			last := siblingVisible - 1
			ordered[last], ordered[activeIdx] = ordered[activeIdx], ordered[last]
		}
	}

	visible := ordered
	var rest []NavTool
	if len(ordered) > siblingVisible {
		visible = ordered[:siblingVisible]
		rest = ordered[siblingVisible:]
	}
	for _, t := range visible {
		writeTab(&b, t, activePath)
	}
	if len(rest) > 0 {
		b.WriteString(`<li role="presentation" class="dropdown"><a class="dropdown-toggle" data-toggle="dropdown" href="javascript:;" role="button" aria-haspopup="true" aria-expanded="false">更多工具<span class="caret"> </span></a><ul class="dropdown-menu">`)
		for _, t := range rest {
			writeTab(&b, t, activePath)
		}
		b.WriteString(`</ul></li>`)
	}
	b.WriteString(`</ul>`)
	return b.String()
}

func writeTab(b *strings.Builder, t NavTool, activePath string) {
	if t.Path == activePath {
		b.WriteString(`<li role="presentation" class="active"><a href="`)
	} else {
		b.WriteString(`<li role="presentation"><a href="`)
	}
	b.WriteString(html.EscapeString(t.Path))
	b.WriteString(`">`)
	b.WriteString(html.EscapeString(t.Label))
	b.WriteString(`</a></li>`)
}
