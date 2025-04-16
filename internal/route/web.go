package route

import (
	"github.com/gin-gonic/gin"
	"uso.link/internal/handler"
)

func WebRule(c *gin.Engine) {
	c.LoadHTMLGlob("vcp/*")
	c.Static("/static", "public/static/")
	c.StaticFile("/ads.txt", "public/ads.txt")
	c.GET("/sitemap.xml", handler.XmlSiteMap)
	c.GET("/sitemap.html", handler.HtmlSiteMap)
	c.GET("/sitemap.txt", handler.TxtSiteMap)
	c.GET("/sitemap", handler.TxtSiteMap)
	c.GET("/", func(c *gin.Context) {
		c.Redirect(302, "/index.html")
	})
	c.GET("/:name.html", handler.RenderPage)
}
