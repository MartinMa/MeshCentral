/*
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var WINPTY_MOUSE_MODE_AUTO = 1;
var WINPTY_SPAWN_FLAG_AUTO_SHUTDOWN = 1;
var GENERIC_WRITE = 0x40000000;
var GENERIC_READ = 0x80000000;
var OPEN_EXISTING = 3

var duplex = require('stream').Duplex;

function windows_terminal()
{
    this._ObjectID = 'windows_terminal';
    this.Create = function Create(path, width, height)
    {
        if (!width) { width = 80; }
        if (!height) { height = 25; }

        var GM = require('_GenericMarshal');

        // Register all required WinPTY API functions.
        var winptyDll = GM.CreateNativeProxy('winpty.dll');
        winptyDll.CreateMethod('winpty_config_new');
        winptyDll.CreateMethod('winpty_config_set_initial_size');
        winptyDll.CreateMethod('winpty_config_set_mouse_mode');
        winptyDll.CreateMethod('winpty_config_set_agent_timeout');
        winptyDll.CreateMethod('winpty_open');
        winptyDll.CreateMethod('winpty_config_free');
        winptyDll.CreateMethod('winpty_agent_process');
        winptyDll.CreateMethod('winpty_conin_name');
        winptyDll.CreateMethod('winpty_conout_name');
        winptyDll.CreateMethod('winpty_conerr_name');
        winptyDll.CreateMethod('winpty_spawn_config_new');
        winptyDll.CreateMethod('winpty_spawn');
        winptyDll.CreateMethod('winpty_spawn_config_free');
        winptyDll.CreateMethod('winpty_free');
        
        // Register all required Kernel32 API functions.
        var kernel32Dll = GM.CreateNativeProxy('kernel32.dll');
        kernel32Dll.CreateMethod('CreateFileW');
        kernel32Dll.CreateMethod('GetProcessId');
        kernel32Dll.CreateMethod('ReadFile');
        kernel32Dll.CreateMethod('WriteFile');
        kernel32Dll.CreateMethod('CloseHandle');

        var config = winptyDll.winpty_config_new(0, 0);

        if (config.Val == 0) {
            throw ('winpty_config_new failed');
        }

        winptyDll.winpty_config_set_initial_size(config, width, height);
        winptyDll.winpty_config_set_mouse_mode(config, WINPTY_MOUSE_MODE_AUTO);
        winptyDll.winpty_config_set_agent_timeout(config, 1000);

        var winpty = winptyDll.winpty_open(config, 0);
        winptyDll.winpty_config_free(config);

        if (winpty.Val == 0) {
            throw ('winpty_open failed');
        }

        var agentProcess = winptyDll.winpty_agent_process(winpty);
        var coninPipeName = GM.CreateVariable(160);
        coninPipeName = winptyDll.winpty_conin_name(winpty);
        var conoutPipeName = GM.CreateVariable(162);
        conoutPipeName = winptyDll.winpty_conout_name(winpty);
        var conerrPipeName = GM.CreateVariable(162);
        conerrPipeName = winptyDll.winpty_conerr_name(winpty);

        var conin = kernel32Dll.CreateFileW(coninPipeName, GENERIC_WRITE, 0, 0, OPEN_EXISTING, 0, 0);
        var conout = kernel32Dll.CreateFileW(conoutPipeName, GENERIC_READ, 0, 0, OPEN_EXISTING, 0, 0);
        var conerr = kernel32Dll.CreateFileW(conerrPipeName, GENERIC_READ, 0, 0, OPEN_EXISTING, 0, 0);

        var spawnConfig = winptyDll.winpty_spawn_config_new(WINPTY_SPAWN_FLAG_AUTO_SHUTDOWN, GM.CreateVariable(path, { wide: true }), 0, 0, 0, 0);

        if (spawnConfig.Val == 0) {
            kernel32Dll.CloseHandle(conout);
            kernel32Dll.CloseHandle(conerr);
            kernel32Dll.CloseHandle(conin);
            throw ('winpty_spawn_config_new failed');
        }

        var process = GM.CreatePointer();
        var spawnSuccess = winptyDll.winpty_spawn(
            winpty,
            spawnConfig,
            process,
            0,
            0,
            0
        );
    
        winptyDll.winpty_spawn_config_free(spawnConfig);

        if (!spawnSuccess) {
            throw ('winpty_spawn failed');
        }

        var processId = kernel32Dll.GetProcessId(process.Deref());

        console.log('processId ' + processId.Val);

        //
        // Create a Stream Object, to be able to read/write data to WinPTY.
        //
        var ret = { _winpty: winpty, _input: conin, _output: conout, kernel32Dll: kernel32Dll };
        ret._process = process;
        ret._pid = processId;
        console.log('before  var ds = new duplex');
        var ds = new duplex(
        {
            'write': function (chunk, flush)
            {
                var written = require('_GenericMarshal').CreateVariable(4);
                this.terminal.kernel32Dll.WriteFile(this.terminal._input, require('_GenericMarshal').CreateVariable(chunk), chunk.length, written, 0);
                flush();
                return (true);
            },
            'final': function (flush)
            {
                if (this.terminal._process)
                {
                    this.terminal._process = null;
                    kernel32Dll.CloseHandle(this.terminal.conout);
                    kernel32Dll.CloseHandle(this.terminal.conerr);
                    kernel32Dll.CloseHandle(this.terminal.conin);
                    winptyDll.winpty_free(this._obj._winpty);
                }
                flush();
            }
        });
        console.log('after var ds = new duplex');
        
        //
        // The ProcessInfo object is signaled when the process exits
        //
        ds._obj = ret;
        ret._waiter = require('DescriptorEvents').addDescriptor(process.Deref());
        ret._waiter.ds = ds;
        ret._waiter._obj = ret;
        ret._waiter.on('signaled', function ()
        {
            // Child process has exited
            this.ds.push(null);

            kernel32Dll.CloseHandle(conout);
            kernel32Dll.CloseHandle(conerr);
            kernel32Dll.CloseHandle(conin);
            winptyDll.winpty_free(winpty);
        });

        ds.terminal = ret;
        ds._rpbuf = GM.CreateVariable(4096);
        ds._rpbufRead = GM.CreateVariable(4);
        ds.__read = function __read()
        {
            // Asyncronously read data from WinPTY
            console.log('inside __read()');
            this._rp = this.terminal.kernel32Dll.ReadFile.async(this.terminal._output, this._rpbuf, this._rpbuf._size, this._rpbufRead, 0);
            console.log('after ReadFile');
            this._rp.then(function ()
            {
                console.log('inside ReadFile callback');
                var len = this.parent._rpbufRead.toBuffer().readUInt32LE();
                if (len <= 0) { return; }

                this.parent.push(this.parent._rpbuf.toBuffer().slice(0, len));
                this.parent.__read();
            });
            this._rp.parent = this;
        };
        console.log('ds.__read();');
        ds.__read();
        return (ds);
    }

    // This evaluates whether or not the powershell binary exists
    this.PowerShellCapable = function ()
    {
        if (require('os').arch() == 'x64')
        {
            return (require('fs').existsSync(process.env['windir'] + '\\SysWow64\\WindowsPowerShell\\v1.0\\powershell.exe'));
        }
        else
        {
            return (require('fs').existsSync(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'));
        }
    }

    // Start WinPTY with the Command Prompt
    this.Start = function Start(CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT)
    {
        return (this.Create(process.env['windir'] + '\\System32\\cmd.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
    }

    // Start WinPTY with PowerShell
    this.StartPowerShell = function StartPowerShell(CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT)
    {
        if (require('os').arch() == 'x64')
        {
            if (require('fs').existsSync(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'))
            {
                return (this.Create(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
            }
            else
            {
                return (this.Create(process.env['windir'] + '\\SysWow64\\WindowsPowerShell\\v1.0\\powershell.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
            }
        }
        else
        {
            return (this.Create(process.env['windir'] + '\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', CONSOLE_SCREEN_WIDTH, CONSOLE_SCREEN_HEIGHT));
        }
    }
}

if (process.platform == 'win32')
{
    module.exports = new windows_terminal();
}
