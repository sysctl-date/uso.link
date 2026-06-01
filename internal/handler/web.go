package handler

import (
	"encoding/xml"
	"fmt"
	"github.com/gin-gonic/gin"
	"net/http"
	"strings"
	"time"
	"uso.link/config"
	"uso.link/internal/utils/log2"
	"uso.link/internal/web_model"
)

type ReqData struct {
	PageName string `json:"name" uri:"name.html" `
}
type XmlSitemapURL struct {
	Loc string `xml:"loc"`
}
type XmlSitemap struct {
	XMLName xml.Name        `xml:"urlset"`
	Xmlns   string          `xml:"xmlns,attr"`
	Urls    []XmlSitemapURL `xml:"url"`
}

var txtsitemap string
var xsitemap XmlSitemap
var htmlsitemap string

func InitSiteMap() {
	var urls []XmlSitemapURL
	htmlsitemap = fmt.Sprintf("<!DOCTYPE html>\n<head>\n<title>优速网 - 网站地图V3.0</title>\n<meta http-equiv=\"Content-type\" content=\"text/html;\" charset=\"UTF-8\" />\n<style>\nbody{font-family: Arial, \"微软雅黑\";font-size: 13px;}\nul, li{margin:0px; padding:0px; list-style:none;}ul{width:800px;margin-left: auto;margin-right: auto;}.title{width:800px;font-size: 18px;}.lks{float: left;padding-right: 15px;line-height: 30px;font-size: 16px;}\n</style>\n</head><body align=\"center\">\n<ul><li class=\"title\"><h3>优速网ksu.one网站地图：(%v)</h3></li>\n", time.Now().Format("2006-01-02"))
	for path, c := range web_model.WebConfig {
		url := "https://" + config.AppHost + "/" + path + ".html"
		urls = append(urls, XmlSitemapURL{
			Loc: url,
		})
		txtsitemap += url + "\r\n"
		htmlsitemap += "<li><a href=\"" + url + "\">" + c.Title + "</a></li>"
	}
	htmlsitemap += "</ul></body></html>"
	xsitemap = XmlSitemap{
		Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9",
		Urls:  urls,
	}
}
func XmlSiteMap(c *gin.Context) {
	c.XML(http.StatusOK, xsitemap)
}
func TxtSiteMap(c *gin.Context) {
	c.String(http.StatusOK, txtsitemap)
}
func HtmlSiteMap(c *gin.Context) {
	c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(htmlsitemap))
}
func RenderPage(c *gin.Context) {

	pageName := ReqData{}
	if err := c.ShouldBindUri(&pageName); log2.IfErrPrt(err) {
		c.String(http.StatusNotFound, "Page not found")
		return
	}
	if ns := strings.Split(pageName.PageName, "."); len(ns) >= 2 {
		pageName.PageName = strings.TrimSpace(ns[0])
	} else {
		c.String(http.StatusNotFound, "Page not found")
		return
	}
	log2.Logf("%v", pageName.PageName)
	if pageData, ok := web_model.WebConfig[pageName.PageName]; ok {
		canonical := pageData.Canonical
		if canonical == "" {
			canonical = "https://" + config.AppHost + "/" + pageName.PageName + ".html"
		}
		c.HTML(http.StatusOK, pageName.PageName+".html", gin.H{
			"title":       pageData.Title,
			"canonical":   canonical,
			"keywords":    pageData.Keywords,
			"description": pageData.Description,
			"navbar":      web_model.NavbarHTML,
			"footerNav":   web_model.FooterNavHTML,
			"siblings":    web_model.SiblingTabs["/"+pageName.PageName+".html"],
		})
	} else {
		c.String(http.StatusNotFound, "Page not found")
	}
}
