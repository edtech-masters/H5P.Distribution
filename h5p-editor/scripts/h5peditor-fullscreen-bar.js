/* global H5PEditor */
H5PEditor.FullscreenBar = (function ($) {
  function FullscreenBar ($mainForm, library) {

    const title = H5PEditor.libraryCache[library] ? H5PEditor.libraryCache[library].title : library;
    const iconId = library.split(' ')[0].split('.')[1].toLowerCase();

    let isInFullscreen = false;
    let exitSemiFullscreen;

    $mainForm.addClass('h5peditor-form-manager');

    // Add fullscreen bar
    const $bar = ns.$('<div/>', {
      'class': 'h5peditor-form-manager-head'
    })

    const $breadcrumb = ns.$('<div/>', {
      'class': 'h5peditor-form-manager-breadcrumb',
      appendTo: $bar
    });

    const $title = ns.$('<div/>', {
      'class': 'h5peditor-form-manager-title ' + iconId,
      text: title,
      appendTo: $breadcrumb
    });

    const fullscreenButton = createButton('fullscreen', '', function () {
      if (isInFullscreen) {
        // Trigger semi-fullscreen exit
        exitSemiFullscreen();
      }
      else {
        // Trigger semi-fullscreen enter
        exitSemiFullscreen = H5PEditor.semiFullscreen($mainForm, function () {
          fullscreenButton.setAttribute('aria-label', H5PEditor.t('core', 'exitFullscreenButtonLabel'));
          isInFullscreen = true;
        }, function () {
          fullscreenButton.setAttribute('aria-label', H5PEditor.t('core', 'enterFullscreenButtonLabel'))
          isInFullscreen = false;
        });
      }
    }, H5PEditor.t('core', 'enterFullscreenButtonLabel'));

    // Create 'Proceed to save' button
    const proceedButton = createButton('proceed', H5PEditor.t('core', 'proceedButtonLabel'), function () {
      exitSemiFullscreen();
    });

    // Create 'Preview' button
    const previewButton = createButton('preview', H5PEditor.t('core', 'previewButtonLabel'), function () {
          const params = window.parent.h5peditorCopy.getParams(true);
          const contentId = window.parent.h5peditorCopy.contentId;
          const brightcoveApiSettingId = window.parent.h5peditorCopy.brightcoveApiSettingId;
          hideOrDisplayEditorForm('hide', $mainForm);
          createPreviewContainer();
          ns.loadJs('https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js', function (err) {
            if (err) {
              console.error('Error while loading script', err);
              return;
            }
            // to avoid editor and preview objects conflicts
            const clonedParams = _.cloneDeep(params);
            loadLibraryWithAllDependencies(library, clonedParams, contentId, brightcoveApiSettingId, renderPreview);
          });

    });

    // Create 'Back to Edit' button
    const backToEditButton = createButton('backToEdit', H5PEditor.t('core', 'backToEditLabel'), function () {

      const  previousPreviewWrapper = document.querySelector(".h5p-preview-wrapper");
      if(previousPreviewWrapper) {
        previousPreviewWrapper.remove();
      }
      hideOrDisplayEditorForm('display', $mainForm);

      previewButton.style.display = 'block';
      this.style.display = 'none';
    });

    backToEditButton.style.display = 'none';

    $bar.append(proceedButton);
    $bar.append(previewButton);
    $bar.append(backToEditButton);
    $bar.append(fullscreenButton);
    $mainForm.prepend($bar);

    // for setting content title
    return $title;
  }

  /**
   * Helper for creating buttons.
   *
   * @private
   * @param {string} id
   * @param {string} text
   * @param {function} clickHandler
   * @param {string} ariaLabel
   * @return {Element}
   */
  const createButton = function (id, text, clickHandler, ariaLabel) {
    if (ariaLabel === undefined) {
      ariaLabel = text;
    }

    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.classList.add('h5peditor-form-manager-button');
    button.classList.add('h5peditor-form-manager-' + id);
    button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', clickHandler);

    // Create special inner filler to avoid focus from pointer devices.
    const content = document.createElement('span');
    content.classList.add('h5peditor-form-manager-button-inner');
    content.innerText = text
    content.tabIndex = -1;
    button.appendChild(content);

    return button;
  };

  const hideOrDisplayEditorForm = function (action, $mainForm) {
    if (action === 'hide') {
      $mainForm.find('.tree').css('display', 'none');
      H5P.jQuery('.h5peditor-form.h5peditor-form-manager>.common').css('display', 'none');
    } else if (action === 'display') {
      $mainForm.find('.tree').css('display', 'block');
      H5P.jQuery('.h5peditor-form.h5peditor-form-manager>.common').css('display', 'block');
    }
  };

  const loadLibraryWithAllDependencies = function (libraryName, params,  contentId, brightcoveApiSettingId, callback) {
        // Load dependencies.
        let body = ns.libraryFromString(libraryName);
        body['parameters'] = JSON.stringify(params);
        if(contentId) {
          body['contentId'] = contentId;
        }
        if(brightcoveApiSettingId) {
          body['brightcoveApiSettingId'] = brightcoveApiSettingId;
        }

        let url = ns.getAjaxUrl('libraries/load-all-dependencies');

        // Add content language to URL
        if (ns.contentLanguage !== undefined) {
          url += (url.indexOf('?') === -1 ? '?' : '&') + 'language=' + ns.contentLanguage;
        }
        // Add common fields default lanuage to URL
        const defaultLanguage = ns.defaultLanguage; // Avoid changes after sending AJAX
        if (defaultLanguage !== undefined) {
          url += (url.indexOf('?') === -1 ? '?' : '&') + 'default-language=' + defaultLanguage;
        }

        // Fire away!
        ns.$.ajax({
          url: url,
          type: 'POST',
          data: JSON.stringify(body),
          contentType: "application/json; charset=utf-8",
          success: function (libraryData) {
                // set filtered params
               if(libraryData.filtered && JSON.parse(libraryData.filtered)) {
                 params.params = JSON.parse(libraryData.filtered);
               }
              // Add CSS.
              if (libraryData.css !== undefined) {
                libraryData.css.forEach(function (path) {
                  if (!H5P.cssLoaded(path)) {
                    H5PIntegration.loadedCss.push(path);
                    if (path) {
                      ns.$('head').append('<link ' +
                          'rel="stylesheet" ' +
                          'href="' + path + '" ' +
                          'type="text/css" ' +
                          '/>');
                    }
                  }
                });
              }

              // Add JS
            if (libraryData.javascript !== undefined && libraryData.javascript.length) {
              for (let path of libraryData.javascript) {
                if (!H5P.jsLoaded(path)) {
                  ns.loadJs(path, function (err) {
                    if (err) {
                      console.error('Error while loading script', err);
                      return;
                    }

                    var isFinishedLoading = libraryData.javascript.reduce(function (hasLoaded, jsPath) {
                      return hasLoaded && H5P.jsLoaded(jsPath);
                    }, true);

                    if (isFinishedLoading) {
                      callback(libraryName, params);
                    }
                  });
                } else {
                  var isFinishedLoading = libraryData.javascript.reduce(function (hasLoaded, jsPath) {
                    return hasLoaded && H5P.jsLoaded(jsPath);
                  }, true);

                  if (isFinishedLoading) {
                    callback(libraryName, params);
                    break;
                  }
                }
              }
            } else {
              // Already loaded, run callback
              callback(libraryName, params);
            }
          },
          error: function (jqXHR, textStatus, errorThrown) {
            if (window['console'] !== undefined) {
              console.warn('Ajax request failed');
              console.warn(jqXHR);
              console.warn(textStatus);
              console.warn(errorThrown);
            }
          },
          dataType: 'json'
        });
  };


  const createPreviewContainer = function() {

    // hide preview button
    H5P.jQuery('.h5peditor-form-manager-backToEdit').css('display', 'block');
    H5P.jQuery('.h5peditor-form-manager-preview').css('display', 'none');

    // remove previous container
    const previousPreviewWrapper = document.querySelector(".h5p-preview-wrapper");
    if (previousPreviewWrapper) {
      previousPreviewWrapper.remove();
    }

    const previewWrapper = document.createElement('div');
    previewWrapper.classList.add('h5p-preview-wrapper');

    const previewContainer = document.createElement('div');
    previewContainer.classList.add('preview-container');
    previewContainer.classList.add('h5p-frame');

    const previewContent = document.createElement('div');
    previewContent.classList.add('preview-content');

    previewContainer.append(previewContent);
    previewWrapper.append(previewContainer);

    let $mainForm = H5P.jQuery('.h5peditor-form.h5peditor-form-manager');
    $mainForm.find('.tree').after(previewWrapper);

    // create Loading Message
    H5P.jQuery('<div/>', {
      class: 'h5p-throbber',
      text: 'Loading, please wait..',
      appendTo:  H5P.jQuery(previewContent)
    });
  };

  const renderPreview = function (library, params) {
    const previewContentElement = H5P.jQuery('.h5p-preview-wrapper > .preview-container > .preview-content');
    const skipResizeLibraries = [
        'H5P.ThreeImage'
    ];
    const currentLibMachineName = ns.libraryFromString(library).machineName;
    try {
      var instance = H5P.newRunnable(
          {
            library: library,
            params: params.params,
            metadata: params.metadata
          },
          undefined,
          previewContentElement,
          skipResizeLibraries.includes(currentLibMachineName),
          {
            standalone: true
          }
      );
      instance.contentId = H5P.createUUID();
      H5PIntegration.contents = {};
      H5PIntegration.contents['cid-' + instance.contentId] = {
        'url': H5PIntegration.baseUrl + '/h5p/embed/' + instance.contentId,
        'metadata': params.metadata,
        'contentUrl': H5PEditor.filesPath
      };
    } catch (e) {
      console.error(e);
    }
    previewContentElement.find('.h5p-throbber').remove();
  };
  return FullscreenBar;
}(ns.jQuery));
