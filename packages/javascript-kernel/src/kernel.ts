import { KernelMessage } from '@jupyterlab/services';

import { BaseKernel, IKernel } from '@jupyterlite/kernel';

import { PromiseDelegate } from '@lumino/coreutils';

import escodegen from 'escodegen';
import * as espree from 'espree';
// import espree from 'espree';

/**
 * A kernel that executes code in an IFrame.
 */
export class JavaScriptKernel extends BaseKernel implements IKernel {
  /**
   * Instantiate a new JavaScriptKernel
   *
   * @param options The instantiation options for a new JavaScriptKernel
   */
  constructor(options: IKernel.IOptions) {
    super(options);

    // create the main IFrame
    this._iframe = document.createElement('iframe');
    this._iframe.style.visibility = 'hidden';
    this._iframe.style.position = 'absolute';
    // position outside of the page
    this._iframe.style.top = '-100000px';
    this._iframe.onload = async () => {
      await this._initIFrame();
      this._ready.resolve();
      window.addEventListener('message', (e: MessageEvent) => {
        const msg = e.data;
        if (msg.event === 'stream') {
          const content = msg as KernelMessage.IStreamMsg['content'];
          this.stream(content);
        }
      });
    };
    document.body.appendChild(this._iframe);
  }

  /**
   * Dispose the kernel.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._iframe.remove();
    super.dispose();
  }

  /**
   * A promise that is fulfilled when the kernel is ready.
   */
  get ready(): Promise<void> {
    return this._ready.promise;
  }

  /**
   * Handle a kernel_info_request message
   */
  async kernelInfoRequest(): Promise<KernelMessage.IInfoReplyMsg['content']> {
    const content: KernelMessage.IInfoReply = {
      implementation: 'JavaScript',
      implementation_version: '0.1.0',
      language_info: {
        codemirror_mode: {
          name: 'javascript',
        },
        file_extension: '.js',
        mimetype: 'text/javascript',
        name: 'javascript',
        nbconvert_exporter: 'javascript',
        pygments_lexer: 'javascript',
        version: 'es2017',
      },
      protocol_version: '5.3',
      status: 'ok',
      banner: 'A JavaScript kernel running in the browser',
      help_links: [
        {
          text: 'JavaScript Kernel',
          url: 'https://github.com/jupyterlite/jupyterlite',
        },
      ],
    };
    return content;
  }

  /**
   * Handle an `execute_request` message
   *
   * @param msg The parent message.
   */
  async executeRequest(
    content: KernelMessage.IExecuteRequestMsg['content']
  ): Promise<KernelMessage.IExecuteReplyMsg['content']> {
    const { code } = content;
    try {
      let result = this._eval(code);

      if (result instanceof Promise) {
        result = await result;
      }

      this.publishExecuteResult({
        execution_count: this.executionCount,
        data: {
          'text/plain': result,
        },
        metadata: {},
      });

      return {
        status: 'ok',
        execution_count: this.executionCount,
        user_expressions: {},
      };
    } catch (e) {
      const { name, stack, message } = e as any as Error;

      this.publishExecuteError({
        ename: name,
        evalue: message,
        traceback: [`${stack}`],
      });

      return {
        status: 'error',
        execution_count: this.executionCount,
        ename: name,
        evalue: message,
        traceback: [`${stack}`],
      };
    }
  }

  /**
   * Handle an complete_request message
   *
   * @param msg The parent message.
   */
  async completeRequest(
    content: KernelMessage.ICompleteRequestMsg['content']
  ): Promise<KernelMessage.ICompleteReplyMsg['content']> {
    // naive completion on window names only
    // TODO: improve and move logic to the iframe
    const vars = this._evalFunc(
      this._iframe.contentWindow,
      'Object.keys(window)'
    ) as string[];
    const { code, cursor_pos } = content;
    const words = code.slice(0, cursor_pos).match(/(\w+)$/) ?? [];
    const word = words[0] ?? '';
    const matches = vars.filter((v) => v.startsWith(word));

    return {
      matches,
      cursor_start: cursor_pos - word.length,
      cursor_end: cursor_pos,
      metadata: {},
      status: 'ok',
    };
  }

  /**
   * Handle an `inspect_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async inspectRequest(
    content: KernelMessage.IInspectRequestMsg['content']
  ): Promise<KernelMessage.IInspectReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Handle an `is_complete_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async isCompleteRequest(
    content: KernelMessage.IIsCompleteRequestMsg['content']
  ): Promise<KernelMessage.IIsCompleteReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Handle a `comm_info_request` message.
   *
   * @param content - The content of the request.
   *
   * @returns A promise that resolves with the response message.
   */
  async commInfoRequest(
    content: KernelMessage.ICommInfoRequestMsg['content']
  ): Promise<KernelMessage.ICommInfoReplyMsg['content']> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `input_reply` message.
   *
   * @param content - The content of the reply.
   */
  inputReply(content: KernelMessage.IInputReplyMsg['content']): void {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_open` message.
   *
   * @param msg - The comm_open message.
   */
  async commOpen(msg: KernelMessage.ICommOpenMsg): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_msg` message.
   *
   * @param msg - The comm_msg message.
   */
  async commMsg(msg: KernelMessage.ICommMsgMsg): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Send an `comm_close` message.
   *
   * @param close - The comm_close message.
   */
  async commClose(msg: KernelMessage.ICommCloseMsg): Promise<void> {
    throw new Error('Not implemented');
  }

  /**
   * Execute code in the kernel IFrame.
   *
   * @param code The code to execute.
   */
  protected _eval(code: string): string | Promise<string> {
    if (code && typeof code === 'string' && code.match(/(:?^|\s+)await\s+/gm)) {
      return this._evalAsyncFunc(this._iframe.contentWindow, code);
    } else {
      return this._evalFunc(this._iframe.contentWindow, code);
    }
  }

  /**
   * Create a new IFrame
   *
   * @param iframe The IFrame to initialize.
   */
  protected async _initIFrame(): Promise<void> {
    if (!this._iframe.contentWindow) {
      return;
    }
    this._evalFunc(
      this._iframe.contentWindow,
      `
        console._log = console.log;
        console._error = console.error;

        window._bubbleUp = function(msg) {
          window.parent.postMessage(msg);
        }

        console.log = function() {
          const args = Array.prototype.slice.call(arguments);
          window._bubbleUp({
            "event": "stream",
            "name": "stdout",
            "text": args.join(' ') + '\\n'
          });
        };
        console.info = console.log;

        console.error = function() {
          const args = Array.prototype.slice.call(arguments);
          window._bubbleUp({
            "event": "stream",
            "name": "stderr",
            "text": args.join(' ') + '\\n'
          });
        };
        console.warn = console.error;

        window.onerror = function(message, source, lineno, colno, error) {
          console.error(message);
        }

        window.onunhandledrejection = function (event) {
          console.error('Unhandled promise rejection reason: ', event.reason);
        }
      `
    );
  }

  private _iframe: HTMLIFrameElement;

  private AsyncFunction = Object.getPrototypeOf(async () => {
    return;
  }).constructor;

  private _evalFunc = (window: any, code: string) =>
    new Function('window', this._ReturnLastStatement(code))(window);

  private _evalAsyncFunc = (window: any, code: string) =>
    new this.AsyncFunction('window', this._ReturnLastStatement(code))(window);

  private _ReturnLastStatement = (code: string) => {
    const wrappedcode = `async () => {
      ${code}
    }`;

    let ast = espree.parse(wrappedcode, {
      ecmaVersion: espree.latestEcmaVersion,
      ecmaFeatures: {
        globalReturn: true,
        impliedStrict: true
      }
    });

    ast = ast.body[0].expression.body;

    const lastStatement = ast.body[ast.body.length - 1];

    if (lastStatement && lastStatement.type) {
      switch (lastStatement.type) {
        case 'ExpressionStatement':
          ast.body[ast.body.length - 1] = {
            type: 'ReturnStatement',
            argument: lastStatement
          };
          break;

        default:
          break;
      }

      code = escodegen.generate(ast, {
        parse: espree.parse
      });
    }

    return code;
  };

  private _ready = new PromiseDelegate<void>();
}
