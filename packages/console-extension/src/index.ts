// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
  ILabStatus,
  IRouter,
  JupyterFrontEndPlugin,
  JupyterFrontEnd,
  Router
} from '@jupyterlab/application';

import { CommandToolbarButton, IThemeManager, Toolbar } from '@jupyterlab/apputils';

import { IConsoleTracker } from '@jupyterlab/console';

import { ITranslator } from '@jupyterlab/translation';

import { clearIcon, refreshIcon, runIcon } from '@jupyterlab/ui-components';

import { SingleWidgetApp } from '@jupyterlite/application';

import { liteIcon } from '@jupyterlite/ui-components';

import { Panel, Widget } from '@lumino/widgets';

/**
 * A plugin to add buttons to the console toolbar.
 */
const buttons: JupyterFrontEndPlugin<void> = {
  id: 'replite:buttons',
  autoStart: true,
  requires: [ITranslator],
  optional: [IConsoleTracker],
  activate: (
    app: JupyterFrontEnd,
    translator: ITranslator,
    tracker: IConsoleTracker | null
  ) => {
    if (!tracker) {
      return;
    }

    const { commands } = app;
    const trans = translator.load('jupyterlab');

    // wrapper commands to be able to override the icon
    const runCommand = 'replite:run';
    commands.addCommand(runCommand, {
      caption: trans.__('Run'),
      icon: runIcon,
      execute: () => {
        return commands.execute('console:run-forced');
      }
    });

    const runButton = new CommandToolbarButton({
      commands,
      id: runCommand
    });

    const restartCommand = 'replite:restart';
    commands.addCommand(restartCommand, {
      caption: trans.__('Restart'),
      icon: refreshIcon,
      execute: () => {
        return commands.execute('console:restart-kernel');
      }
    });

    const restartButton = new CommandToolbarButton({
      commands,
      id: restartCommand
    });

    const clearCommand = 'replite:clear';
    commands.addCommand(clearCommand, {
      caption: trans.__('Clear'),
      icon: clearIcon,
      execute: () => {
        return commands.execute('console:clear');
      }
    });

    const clearButton = new CommandToolbarButton({
      commands,
      id: clearCommand
    });

    tracker.widgetAdded.connect((_, console) => {
      const { toolbar } = console;

      console.toolbar.addItem('run', runButton);
      console.toolbar.addItem('restart', restartButton);
      console.toolbar.addItem('clear', clearButton);

      toolbar.addItem('spacer', Toolbar.createSpacerItem());

      const wrapper = new Panel();
      wrapper.addClass('jp-PoweredBy');

      const node = document.createElement('a');
      node.title = trans.__('Powered by JupyterLite');
      node.href = 'https://github.com/jupyterlite/jupyterlite';
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      const poweredBy = new Widget({ node });
      liteIcon.element({
        container: node,
        elementPosition: 'center',
        margin: '2px 2px 2px 8px',
        height: 'auto',
        width: '16px'
      });

      wrapper.addWidget(poweredBy);
      toolbar.insertAfter('spacer', 'powered-by', wrapper);
    });
  }
};

/**
 * A plugin to open a code console and
 * parse custom parameters from the query string arguments.
 */
const consolePlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlite/console-extension:console',
  autoStart: true,
  optional: [IConsoleTracker, IThemeManager],
  activate: (
    app: JupyterFrontEnd,
    tracker: IConsoleTracker | null,
    themeManager: IThemeManager | null
  ) => {
    if (!tracker) {
      return;
    }
    const { commands } = app;

    const search = window.location.search;
    const urlParams = new URLSearchParams(search);
    const code = urlParams.getAll('code');
    const kernel = urlParams.get('kernel') || undefined;
    const theme = urlParams.get('theme')?.trim();
    const toolbar = urlParams.get('toolbar');

    app.started.then(() => {
      commands.execute('console:create', { kernelPreference: { name: kernel } });
    });

    if (theme && themeManager) {
      const themeName = decodeURIComponent(theme);
      themeManager.setTheme(themeName);
    }

    tracker.widgetAdded.connect(async (_, widget) => {
      const { console } = widget;

      if (!toolbar) {
        // hide the toolbar by default if not specified
        widget.toolbar.dispose();
      }

      if (code) {
        await console.sessionContext.ready;
        code.forEach(line => console.inject(line));
      }
    });
  }
};

/**
 * The default JupyterLab application status provider.
 */
const status: JupyterFrontEndPlugin<ILabStatus> = {
  id: '@jupyterlite/console-extension:status',
  autoStart: true,
  provides: ILabStatus,
  activate: (app: JupyterFrontEnd) => {
    if (!(app instanceof SingleWidgetApp)) {
      throw new Error(`${status.id} must be activated in SingleWidgetApp.`);
    }
    return app.status;
  }
};

/**
 * The default paths for a single widget app.
 */
const paths: JupyterFrontEndPlugin<JupyterFrontEnd.IPaths> = {
  id: '@jupyterlite/console-extension:paths',
  autoStart: true,
  provides: JupyterFrontEnd.IPaths,
  activate: (app: JupyterFrontEnd): JupyterFrontEnd.IPaths => {
    if (!(app instanceof SingleWidgetApp)) {
      throw new Error(`${paths.id} must be activated in SingleWidgetApp.`);
    }
    return app.paths;
  }
};

/**
 * The default URL router provider.
 */
const router: JupyterFrontEndPlugin<IRouter> = {
  id: '@jupyterlite/console-extension:router',
  autoStart: true,
  provides: IRouter,
  requires: [JupyterFrontEnd.IPaths],
  activate: (app: JupyterFrontEnd, paths: JupyterFrontEnd.IPaths) => {
    const { commands } = app;
    const base = paths.urls.base;
    const router = new Router({ base, commands });
    void app.started.then(() => {
      // Route the very first request on load.
      void router.route();

      // Route all pop state events.
      window.addEventListener('popstate', () => {
        void router.route();
      });
    });
    return router;
  }
};

const plugins: JupyterFrontEndPlugin<any>[] = [
  buttons,
  consolePlugin,
  paths,
  router,
  status
];

export default plugins;
