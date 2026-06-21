echo startbatchfile stock_oldinfo_collect.bat
echo batchfileparams: %1 %2 %3 %4
::python D:\2024_GIT\python-multiasset-trader\stock_oldinfo_collect.py %1 %2 %3 %4
::python C:\Users\user\Documents\GitHub\python-multiasset-trader\stock_oldinfo_collect.pyw %1 %2 %3 %4

::start "" /wait "python" "C:\Users\user\Documents\GitHub\python-multiasset-trader\stock_oldinfo_collect.pyw" %*
pythonw "C:\Users\user\Documents\GitHub\python-multiasset-trader\stock_oldinfo_collect.pyw" %*