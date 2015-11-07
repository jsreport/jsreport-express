module.exports = function (grunt) {
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    copy: {
      dev: {files: [{src: ['public/js/app_dev.js'], dest: 'public/js/app_built.js'}]}
    },

    requirejs: {
      compileApp: {
        options: {
          baseUrl: './public/js',
          mainConfigFile: './public/js/require_main_fixed.js',
          out: './public/js/app_built.js',
          name: 'app',
          removeCombined: true,
          findNestedDependencies: true,
          onBuildWrite: function (moduleName, path, contents) {
            return contents.replace("define('app',", 'define(')
          }
        }
      }
    },

    replace: {
      devRoot: {
        src: ['./public/views/root.html'],
        dest: ['./public/views/root_dev.html'],
        replacements: [
          {from: '{{dynamicBust}}', to: 'new Date().getTime()'},
          {from: '{{staticBust}}', to: ''}
        ]
      },
      productionRoot: {
        src: ['./public/views/root.html'],
        dest: ['./public/views/root_built.html'],
        replacements: [
          {from: '{{dynamicBust}}', to: '\"' + new Date().getTime() + '\"'},
          {from: '{{staticBust}}', to: new Date().getTime() + ''}
        ]
      },
      requirejsMain: {
        src: ['./public/js/require_main.js'],
        dest: ['./public/js/require_main_fixed.js'],
        replacements: [
          {from: 'jsreport_server_url + "js"', to: '"/js"'},
          {from: 'jsreport_main_app', to: "'app_built'"}
        ]
      }
    },

    cssmin: {
      options: {
        'skip-import': true,
        'advanced': false
      },
      target: {
        files: {
          'public/css/built.css': [
            'public/css/bootstrap.min.css', 'public/css/bootstrap-nonresponsive.css',
            'public/css/toastr.css', 'public/css/split-pane.css',
            'public/css/style.css', 'public/css/introjs.css',
            'public/css/bootstrap-multiselect.css'
          ],
          'public/css/built_embed.css': [
            'public/css/bootstrap.min.css', 'public/css/bootstrap-nonresponsive.css',
            'public/css/toastr.css', 'public/css/split-pane.css',
            'public/css/embed.css', 'ublic/css/introjs.css'
          ]
        }
      }
    }
  })

  grunt.loadNpmTasks('grunt-contrib-cssmin')
  grunt.loadNpmTasks('grunt-contrib-requirejs')
  grunt.loadNpmTasks('grunt-contrib-copy')
  grunt.loadNpmTasks('grunt-text-replace')
  grunt.loadNpmTasks('grunt-contrib-concat')

  grunt.registerTask('default', ['build'])

  grunt.registerTask('build', ['build-dev', 'build-prod'])
  grunt.registerTask('build-dev', ['copy:dev', 'replace:devRoot'])
  grunt.registerTask('build-prod', ['replace:requirejsMain', 'requirejs', 'cssmin', 'replace:productionRoot'])
}
