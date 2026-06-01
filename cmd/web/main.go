package main

import (
	"github.com/gin-gonic/gin"
	"uso.link/internal/handler"
	"uso.link/internal/route"
	"uso.link/internal/utils/log2"
	"uso.link/internal/web_model"
)

func main() {
	if web_model.InitWebModel("./web.json") != nil {
		return
	}
	if web_model.InitNav("./nav.json") != nil {
		return
	}
	r := gin.Default()
	go handler.InitSiteMap()
	route.WebRule(r)
	log2.Logf("run in 0.0.0.0:12345")
	log2.IfErrPrt(r.Run(":12345"))
}
