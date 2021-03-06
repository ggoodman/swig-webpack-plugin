var fs = require('fs');
var path = require('path');
var glob = require('glob');
var beautify = require('js-beautify').html;
var uglify = require('html-minifier');
var swig = require('swig');
var swigOptions = {
  cache: false
};

function SwigWebpackPlugin(options) {
  this.options = options || {};
}

SwigWebpackPlugin.prototype.apply = function(compiler) {
  var self = this;
  compiler.plugin('emit', function(compiler, callback) {
    var webpackStatsJson = compiler.getStats().toJson();
    var templateParams = {};
    templateParams.webpack = webpackStatsJson;
    templateParams.swigWebpackPlugin = {};
    templateParams.swigWebpackPlugin.assets = self.swigWebpackPluginAssets(compiler, webpackStatsJson);
    templateParams.swigWebpackPlugin.options = self.options;

    var outputFilename = self.options.filename || 'index.html';
    var watchTemplate = true;
    var context = this.context;

    if (self.options.watch) {
      var watchFiles = glob.sync(self.options.watch, {});
      if(watchFiles.length > 0) {
        watchFiles.forEach(function(file) {
          compiler.fileDependencies.push(path.join(context, file));
        });
        watchTemplate = false;
      } else {
        compiler.errors.push(new Error('SwigWebpackPlugin: could not add watch-files to dependencies'));
      }
    }

    if (self.options.templateContent && self.options.template) {
      compiler.errors.push(new Error('SwigWebpackPlugin: cannot specify both template and templateContent options.'));
      callback();
    } else if (self.options.templateContent) {
      self.emitHtml(compiler, null, self.options.templateContent, templateParams, outputFilename);
      callback();
    } else {
      var templateFile = path.join(context, self.options.template);
      if (!templateFile) {
        templateFile = path.join(__dirname, 'template/index.html');
      }
      
      var files = glob.sync(templateFile, {});
      if (files.length > 0) {
        files.forEach(function(template) {
          if(watchTemplate) {
            compiler.fileDependencies.push(path.join(context, template));
          }
          var data = fs.readFileSync(template, 'utf8');
          if (data) {
            self.emitHtml(compiler, template, null, templateParams, path.basename(template));
          } else {
            compiler.errors.push(new Error('SwigWebpackPlugin: Unable to read HTML template "' + template + '"'));
          }
        });
      } else {
        compiler.errors.push(new Error('SwigWebpackPlugin: Unable to read files'));
      }
      callback();
    }
  });
};

SwigWebpackPlugin.prototype.emitHtml = function(compiler, htmlTemplateFile, htmlTemplateContent, templateParams, outputFilename) {
  var template;
  swig.setDefaults(swigOptions);
  if (htmlTemplateFile) {
    template = swig.compileFile(htmlTemplateFile);
  } else if (htmlTemplateContent) {
    template = swig.compile(htmlTemplateContent);
  } else {
    compiler.errors.push(new Error('SwigWebpackPlugin: cannot find a templateFile or templateContent.'));
  }
  var html = template(templateParams);
  html = this.htmlFormatter(templateParams.swigWebpackPlugin.options, html);
  compiler.assets[outputFilename] = {
    source: function() {
      return html;
    },
    size: function() {
      return html.length;
    }
  };
};

SwigWebpackPlugin.prototype.htmlFormatter = function(options, html) {
  if (options.beautify) {
    return beautify(html, {
      indentSize: 2
    });
  } else if (options.uglify) {
    return uglify.minify(String(html), {
      collapseWhitespace: true
    });
  } else {
    return html;
  }
};

SwigWebpackPlugin.prototype.swigWebpackPluginAssets = function(compiler, webpackStatsJson) {
  var assets = {};
  for (var chunk in webpackStatsJson.assetsByChunkName) {
    var chunkValue = webpackStatsJson.assetsByChunkName[chunk];
    var chunkAssets = {
      js: [],
      css: [],
    };

    // Webpack outputs an array for each chunk when using sourcemaps
    if (!(chunkValue instanceof Array)) {
      // Is the main bundle always the first element?
      chunkValue = [chunkValue];
    }

    chunkValue.forEach(function (chunkFile) {
      var ext = path.extname(chunkFile).slice(1);
      
      if (ext) {
        if (!chunkAssets[ext]) {
          chunkAssets[ext] = [];
        }
        
        chunkAssets[ext].push((compiler.options.output.publicPath ? compiler.options.output.publicPath : "") + chunkFile);
      }
    });
    // if (compiler.options.output.publicPath) {
    // 	chunkValue = compiler.options.output.publicPath + chunkValue;
    // }
    assets[chunk] = chunkAssets;
  }

  return assets;
};

module.exports = SwigWebpackPlugin;
